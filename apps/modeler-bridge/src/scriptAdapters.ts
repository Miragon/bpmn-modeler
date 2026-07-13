/**
 * Bridge-only orchestrator for the "Edit Script" feature on a remote host.
 *
 * The VS Code `ScriptTaskService` was deliberately *not* extracted to core: its
 * guts (resync-on-hidden-webview, `tabGroups` tracking) are VS Code accidental
 * complexity that doesn't port — JCEF webviews are never "hidden" the way VS
 * Code editor panels are, so no resync machinery is needed here.
 *
 * The bridge writes each script as a real file under
 * `<configFolder>/tmp/scripting/` and hands the host its absolute path; a real
 * `VirtualFile` (rather than an in-memory `LightVirtualFile`) is what
 * re-enables IdeaVim and file-based AI tooling in the IntelliJ tab. The bridge
 * also owns the disk hygiene: a one-shot orphan sweep per base directory, a
 * `.gitignore`, and deletion on tab close / editor dispose.
 *
 * This class owns all BPMN/element knowledge: it addresses scripts by a stable
 * `ScriptUri` and hands the host an opaque `scriptId`; the host is a dumb
 * editor surface keyed by that id, and host-reported edits map back to the
 * right webview here.
 */

import { tmpdir } from "os";
import { posix } from "path";

import {
    ArtifactService,
    beansFor,
    COMPLEX_TYPES,
    EditorSessionStore,
    globalFunctionsFor,
    methodsForBean,
    NotifierPort,
    PickerPort,
    ScriptLanguage,
    ScriptUri,
    ScriptVariableManifestService,
    TMP_SCRIPTING_SEGMENT,
    WorkspacePort,
} from "@miragon/bpmn-modeler-core";
import {
    AsyncDebounced,
    asyncDebounce,
    dedupeVariables,
    OpenScriptEditorCommand,
    OpenScriptEditorRef,
    ScriptKind,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
    UpdateScriptSourceCommand,
    VariableDef,
    VariableManifestEntry,
} from "@miragon/bpmn-modeler-shared";

import { BridgeSettings } from "./nodeAdapters";
import { Rpc } from "./rpc";
import { METHODS } from "./protocol/descriptor";

/** The element-addressing fields needed to route a host edit back to the webview. */
interface TrackedScript {
    readonly editorId: string;
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
}

/**
 * Per-script tracking lives here, never on the host: re-opening the same script
 * resolves to the same `scriptId`, so the host can reveal an existing tab
 * instead of duplicating it, and `didChange` can be mapped back to the element
 * without the host knowing anything about BPMN.
 */
export class BridgeScriptEditor {
    private readonly scripts = new Map<string, TrackedScript>();

    // Absolute file path per open script, retained for deletion on close.
    private readonly filePathByScript = new Map<string, string>();

    /**
     * Base `tmp/scripting` directory per editor, cached at first open so
     * teardown deletes from the directory the files were actually written to
     * even if the configFolder setting changed mid-session.
     */
    private readonly baseDirByEditor = new Map<string, string>();

    /**
     * Base directories already swept this process. The orphan sweep (files
     * left behind by a crashed host) must run exactly once per directory and
     * strictly before the first file is written into it — a later sweep
     * would delete live scripts of other editors sharing the directory.
     */
    private readonly sweptBaseDirs = new Set<string>();

    /**
     * Deferred cleanups keyed by scriptId, armed when *we* send `script/close`
     * and run on the host's `script/didClose` ack. The host flush-saves the
     * closing document before acking; deleting the file eagerly would race
     * that save, which would rewrite the just-deleted file as an orphan no
     * cleanup path owns. A lost ack (host death) leaves the directory for the
     * next process start's orphan sweep.
     */
    private readonly pendingCloseAcks = new Map<string, () => void>();

    /** How long host keystrokes coalesce before one streams into the webview model. */
    private static readonly STREAM_DEBOUNCE_MS = 300;

    /**
     * One debounced content sender per open `scriptId`. Every host-reported
     * keystroke re-arms the trailing edge, so a burst of typing produces a
     * single `UpdateScriptContentQuery` (and the full diagram XML export behind
     * it) instead of one per character. The sender body owns the error logging,
     * so it never rejects. Perf-only here: JCEF webviews never hide, so unlike
     * VS Code there is no lost-edit bug to guard against.
     */
    private readonly contentSenders = new Map<
        string,
        AsyncDebounced<(content: string) => Promise<void>>
    >();

    // Two process-variable sources per editor, kept apart and merged on read
    // (mirrors the VS Code `ScriptVariableStore`): the webview-extracted model
    // (seeded on open, replaced on every `UpdateScriptVariablesCommand`) and the
    // `*.bpmn.vars.json` manifest model (loaded on session register, refreshed by
    // the file watcher). `mergedFor` deduplicates them so the manifest's
    // `authored` tier wins clashes; the merge feeds both the `script/open`
    // payload and the `script/updateVariables` push.
    private readonly extractedByEditor = new Map<string, VariableDef[]>();
    private readonly manifestByEditor = new Map<string, VariableDef[]>();

    // The editor's diagram fs path, retained so `appendToManifest` can resolve
    // which manifest to write — a script tab is addressed only by an opaque
    // `scriptId`, which carries no path. Seeded when `loadManifest` runs at
    // session register.
    private readonly documentPathByEditor = new Map<string, string>();

    constructor(
        private readonly store: EditorSessionStore,
        private readonly picker: PickerPort,
        private readonly rpc: Rpc,
        private readonly notifier: NotifierPort,
        private readonly settings: BridgeSettings,
        private readonly manifestSvc: ScriptVariableManifestService,
        private readonly workspace: WorkspacePort,
        private readonly artifactSvc: ArtifactService,
    ) {}

    /**
     * Opens (or reveals) an inline script in a host text editor.
     *
     * Prompts for a language only when the model's `scriptFormat` is missing or
     * unsupported, persisting the pick back to the model so the next open skips
     * the prompt — mirroring the VS Code flow. `script/open` always carries the
     * content; the host ignores it when the `scriptId` is already tracked and
     * just reveals the existing tab (so a re-open never clobbers in-flight edits).
     */
    async open(cmd: OpenScriptEditorCommand, editorId: string): Promise<void> {
        let effectiveFormat = cmd.scriptFormat;
        if (!ScriptLanguage.isSupported(cmd.scriptFormat)) {
            const picked = await this.picker.pickScriptLanguage(cmd.scriptFormat);
            if (!picked) {
                return;
            }
            effectiveFormat = picked;
            await this.sendFormatUpdate(editorId, cmd, picked);
        }

        const lang = new ScriptLanguage(effectiveFormat);
        const uri = new ScriptUri(
            editorId,
            cmd.elementId,
            cmd.kind,
            cmd.listenerIndex,
            cmd.eventName,
            lang.extension,
        );
        const scriptId = uri.toString();

        // Re-opening a script whose close is still awaiting the host's ack:
        // cancel the deferred deletion (the late ack must not tear down the
        // fresh tab) and rewrite the file — the bytes on disk are the last
        // save, which may trail the model content we were just handed.
        if (this.pendingCloseAcks.delete(scriptId)) {
            this.filePathByScript.delete(scriptId);
        }

        // Write the real file only on first open: a re-open just reveals the
        // existing tab, and rewriting the file underneath IntelliJ's (possibly
        // unsaved) document would trigger its external-change conflict dialog.
        let filePath = this.filePathByScript.get(scriptId);
        if (filePath === undefined) {
            const baseDir = await this.prepareBaseDir(editorId);
            filePath = posix.join(baseDir, uri.relativePath());
            try {
                await this.workspace.writeFile(filePath, cmd.content);
                this.filePathByScript.set(scriptId, filePath);
            } catch (error) {
                // The host falls back to a LightVirtualFile from `content`
                // when the path doesn't resolve, so an unwritable disk
                // degrades to the pre-real-file behaviour instead of failing.
                this.notifier.logError(error as Error);
            }
        }

        this.scripts.set(scriptId, {
            editorId,
            elementId: cmd.elementId,
            kind: cmd.kind,
            listenerIndex: cmd.listenerIndex,
        });

        // Seed the editor's extracted model from the open command so the host has
        // variable completion before the first live update arrives.
        this.extractedByEditor.set(editorId, cmd.variables ?? []);

        // The SPIN globals (`S`/`JSON`) and the type→methods table are gated here
        // in the bridge (single source): off → empty, so the Kotlin contributor
        // renders nothing and needs no gate of its own. Shipping the full
        // `COMPLEX_TYPES` map when on is harmless — the host only consults `types`
        // on a variable's `typeHint` lookup, and `SpinJsonNode` is the only hint
        // the producer heuristic currently stamps.
        const spinOn = this.settings.getScriptingSpin();

        // `fileName` carries the extension so the host infers the FileType for
        // highlighting; `content` is honoured only on first open (see above).
        // `completion` ships the kind-scoped bean/method catalog resolved *here*
        // so the thin Kotlin host never needs to know which beans belong to which
        // kind — it just renders what it is handed (VS Code's
        // `registerCompletionItemProvider` has no PSI-based analogue, so the host
        // drives a `CompletionContributor` off this payload instead). `variables`
        // rides alongside so the host can complete process-variable names too.
        this.rpc.notify(METHODS.scriptOpen, {
            scriptId,
            fileName: uri.filename,
            languageId: lang.languageId,
            filePath,
            content: cmd.content,
            completion: {
                beans: beansFor(cmd.kind).map((bean) => ({
                    name: bean.name,
                    type: bean.type,
                    description: bean.description,
                    // Empty for value beans (e.g. `eventName: String`) — correct,
                    // they have no member completion.
                    methods: methodsForBean(bean),
                })),
                variables: this.mergedFor(editorId),
                globals: spinOn ? globalFunctionsFor(cmd.kind) : [],
                types: spinOn
                    ? Object.fromEntries(COMPLEX_TYPES.map((type) => [type.name, type.methods]))
                    : {},
            },
        });

        // A tab now owns this script — lock the matching webview panel field.
        this.broadcastOpenScripts(editorId);
    }

    /**
     * Resolves (and caches) the editor's `tmp/scripting` base directory,
     * sweeping orphans and dropping the `.gitignore` the first time a
     * directory is used in this process. The sweep runs strictly before the
     * first file is written into the directory, so it only ever removes
     * leftovers of a previous (crashed) host process.
     *
     * Resolution mirrors the vars-manifest path: workspace root → config
     * folder. A document without a resolvable directory (non-file session)
     * falls back to the OS temp dir, keeping the `tmp/scripting` marker
     * segments intact for `parseScriptPath`.
     */
    private async prepareBaseDir(editorId: string): Promise<string> {
        let baseDir = this.baseDirByEditor.get(editorId);
        if (baseDir === undefined) {
            const documentPath = this.documentPathByEditor.get(editorId);
            try {
                if (documentPath === undefined) {
                    throw new Error("no document path for editor");
                }
                const documentDir = this.workspace.getDocumentDirectory(documentPath);
                const workspaceRoot = await this.artifactSvc.getWorkspaceRoot(documentDir);
                baseDir = posix.join(
                    workspaceRoot,
                    this.settings.getConfigFolder(),
                    TMP_SCRIPTING_SEGMENT,
                );
            } catch {
                baseDir = posix.join(
                    tmpdir().replace(/\\/g, "/"),
                    "miragon-bpmn-modeler",
                    TMP_SCRIPTING_SEGMENT,
                );
            }
            this.baseDirByEditor.set(editorId, baseDir);
        }

        if (!this.sweptBaseDirs.has(baseDir)) {
            this.sweptBaseDirs.add(baseDir);
            try {
                await this.workspace.deleteDirectory(baseDir);
                await this.workspace.writeFile(
                    posix.join(posix.dirname(baseDir), ".gitignore"),
                    "*\n",
                );
            } catch (error) {
                this.notifier.logError(error as Error);
            }
        }
        return baseDir;
    }

    /**
     * Re-broadcasts the open-script set for an editor so the webview's
     * properties-panel lock is restored after a reload. Called on the
     * `GetBpmnModelerSettingCommand` handshake, the same signal the webview
     * sends whenever it (re)initialises.
     */
    syncLockState(editorId: string): void {
        this.broadcastOpenScripts(editorId);
    }

    /**
     * Applies a *model-originated* content change (canvas undo/redo, document
     * reload, element deletion) reported by the webview to the owning tab.
     *
     * `content === undefined` means the script surface no longer exists: the
     * tab is closed and its file deleted. Otherwise the host overwrites the
     * open document via `script/updateContent` (echo-guarded on the host);
     * the file on disk follows through IntelliJ's own save cycle.
     */
    applyModelChange(cmd: UpdateScriptSourceCommand, editorId: string): void {
        for (const [scriptId, entry] of this.scripts) {
            if (
                entry.editorId !== editorId ||
                entry.elementId !== cmd.elementId ||
                entry.kind !== cmd.kind ||
                (entry.listenerIndex ?? 0) !== (cmd.listenerIndex ?? 0)
            ) {
                continue;
            }
            if (cmd.content === undefined) {
                // Surface gone: drop the sender so a pending keystroke can't
                // fire against a deleted element.
                this.dropSender(scriptId);
                this.scripts.delete(scriptId);
                this.requestClose(scriptId);
                this.broadcastOpenScripts(editorId);
            } else {
                // Canvas undo/redo overwrites the tab; cancel any pending
                // keystroke so it can't fire afterwards and clobber the undo.
                this.contentSenders.get(scriptId)?.cancel();
                this.rpc.notify(METHODS.scriptUpdateContent, {
                    scriptId,
                    content: cmd.content,
                });
            }
            return;
        }
    }

    /**
     * Tells the host to close a script tab and defers the file deletion until
     * its `script/didClose` ack — the host flush-saves the closing document
     * first, and only the ack guarantees that save has landed.
     */
    private requestClose(scriptId: string, onAcked?: () => void): void {
        this.rpc.notify(METHODS.scriptClose, { scriptId });
        this.pendingCloseAcks.set(scriptId, () => {
            void this.deleteScriptDir(scriptId).then(onAcked);
        });
    }

    /** Deletes the script's slug directory on disk; failures are logged only. */
    private deleteScriptDir(scriptId: string): Promise<void> {
        const filePath = this.filePathByScript.get(scriptId);
        this.filePathByScript.delete(scriptId);
        if (filePath === undefined) {
            return Promise.resolve();
        }
        return this.workspace
            .deleteDirectory(posix.dirname(filePath))
            .catch((error) => this.notifier.logError(error as Error));
    }

    /**
     * Posts the full set of open inline-script editors for `editorId` so the
     * webview locks the matching panel fields (single-writer arbitration). The
     * tab's file name is the last `scriptId` path segment — the `ScriptUri`
     * already ends in the human-facing filename, so no extra tracking is needed.
     */
    private broadcastOpenScripts(editorId: string): void {
        const openScripts: OpenScriptEditorRef[] = [];
        for (const [scriptId, entry] of this.scripts) {
            if (entry.editorId !== editorId) {
                continue;
            }
            openScripts.push({
                elementId: entry.elementId,
                kind: entry.kind,
                listenerIndex: entry.listenerIndex,
                fileName: scriptId.substring(scriptId.lastIndexOf("/") + 1),
            });
        }
        this.store
            .postMessage(editorId, new UpdateOpenScriptEditorsQuery(openScripts))
            .catch((error) => this.notifier.logError(error as Error));
    }

    /**
     * Replaces an editor's webview-extracted model and re-pushes the merged
     * model to every open script tab of that editor via `script/updateVariables`,
     * so completion goes live without reopening. Scoped to the originating
     * editor's scripts only.
     */
    updateVariables(editorId: string, variables: VariableDef[]): void {
        this.extractedByEditor.set(editorId, variables);
        this.pushVariables(editorId);
    }

    /**
     * Loads the `*.bpmn.vars.json` manifest for an editor and re-pushes the merged
     * model. Called on session register (no tabs open yet, so the push is a no-op
     * that just seeds the manifest source) and on every manifest file change.
     * A read error is logged and leaves the previous manifest model in place.
     */
    async loadManifest(editorId: string, documentPath: string): Promise<void> {
        this.documentPathByEditor.set(editorId, documentPath);
        try {
            this.manifestByEditor.set(editorId, await this.manifestSvc.load(documentPath));
        } catch (error) {
            this.notifier.logError(error as Error);
            return;
        }
        this.pushVariables(editorId);
    }

    /**
     * Watches the manifest file and reloads + re-pushes on any change. The
     * returned handle is owned by the session feature, which disposes it when the
     * editor closes. Async because resolving the manifest path needs the
     * workspace root.
     */
    async watchManifest(editorId: string, documentPath: string): Promise<{ dispose(): void }> {
        return this.manifestSvc.createWatcher(documentPath, () => {
            void this.loadManifest(editorId, documentPath);
        });
    }

    /** Deduplicated manifest-over-extracted model; manifest's `authored` tier wins. */
    private mergedFor(editorId: string): VariableDef[] {
        const manifest = this.manifestByEditor.get(editorId) ?? [];
        const extracted = this.extractedByEditor.get(editorId) ?? [];
        return dedupeVariables([...manifest, ...extracted]);
    }

    /** Pushes the merged model to every open script tab of `editorId`. */
    private pushVariables(editorId: string): void {
        const variables = this.mergedFor(editorId);
        for (const [scriptId, entry] of this.scripts) {
            if (entry.editorId === editorId) {
                this.rpc.notify(METHODS.scriptUpdateVariables, { scriptId, variables });
            }
        }
    }

    /** Host reported an edit in the script editor → push it into the owning webview. */
    didChange(scriptId: string, content: string): void {
        const entry = this.scripts.get(scriptId);
        if (!entry) {
            return;
        }
        // Fire-and-forget through the per-script debounced sender: it owns the
        // postMessage and error logging, and never rejects.
        void this.getSender(scriptId, entry)(content);
    }

    /**
     * Lazily creates (and caches) the debounced content sender for a script.
     * The closure captures the tracked-script addressing — stable for a given
     * `scriptId` — and streams the latest content into the webview model,
     * owning its own error logging so the debounced body never rejects.
     */
    private getSender(
        scriptId: string,
        entry: TrackedScript,
    ): AsyncDebounced<(content: string) => Promise<void>> {
        let sender = this.contentSenders.get(scriptId);
        if (!sender) {
            sender = asyncDebounce(async (content: string) => {
                try {
                    await this.store.postMessage(
                        entry.editorId,
                        new UpdateScriptContentQuery(
                            entry.elementId,
                            entry.kind,
                            entry.listenerIndex,
                            content,
                        ),
                    );
                } catch (error) {
                    this.notifier.logError(error as Error);
                }
            }, BridgeScriptEditor.STREAM_DEBOUNCE_MS);
            this.contentSenders.set(scriptId, sender);
        }
        return sender;
    }

    /** Cancels any pending keystroke for `scriptId` and forgets its sender. */
    private dropSender(scriptId: string): void {
        this.contentSenders.get(scriptId)?.cancel();
        this.contentSenders.delete(scriptId);
    }

    /**
     * Host reported a script tab is closed. For a close *we* requested this is
     * the ack that the host's flush-save finished — run the deferred deletion
     * (tracking and the lock broadcast were already handled at request time).
     * For a user-initiated close, drop tracking so a re-open re-reads the
     * current BPMN content, release the lock, and delete the file — the host
     * flushed the document before sending this.
     */
    async didClose(scriptId: string): Promise<void> {
        // Force the last <300 ms of typing into the model before tearing the
        // script down, then drop the sender. On the ack branch the sender was
        // already cancelled by applyModelChange/disposeEditor, so this is a
        // no-op there.
        await this.contentSenders.get(scriptId)?.flush();
        this.dropSender(scriptId);

        const pendingAck = this.pendingCloseAcks.get(scriptId);
        if (pendingAck) {
            this.pendingCloseAcks.delete(scriptId);
            pendingAck();
            return;
        }
        // Capture the owner before deleting so the lock release reflects the removal.
        const editorId = this.scripts.get(scriptId)?.editorId;
        this.scripts.delete(scriptId);
        void this.deleteScriptDir(scriptId);
        if (editorId !== undefined) {
            this.broadcastOpenScripts(editorId);
        }
    }

    /**
     * The host's "Declare in variable manifest" intention fired: scaffold the
     * entry in the script's diagram manifest, then reveal the file so the author
     * fills in `type`/`description`. Reveal reuses the existing `notifier/openDocument`
     * capability (already implemented on the host).
     *
     * The re-push is done explicitly via `loadManifest` rather than left to the
     * per-session manifest watcher: `fs.watch` latency is unbounded (and flaky in
     * CI), so waiting for the watcher to observe *our own* write would make the new
     * authored entry appear only after an indeterminate delay. The watcher still
     * covers external edits; a redundant watcher-driven re-push afterwards is
     * idempotent.
     */
    async appendToManifest(scriptId: string, entry: VariableManifestEntry): Promise<void> {
        const tracked = this.scripts.get(scriptId);
        if (!tracked) {
            return;
        }
        const documentPath = this.documentPathByEditor.get(tracked.editorId);
        if (!documentPath) {
            return;
        }
        try {
            const manifestPath = await this.manifestSvc.upsert(documentPath, entry);
            await this.notifier.openDocument(manifestPath);
            await this.loadManifest(tracked.editorId, documentPath);
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    /**
     * The BPMN editor was disposed: tell the host to close every script tab it
     * opened for that editor and drop their tracking. Iterating while deleting is
     * safe for a `Map` — only already-visited or current entries are removed.
     *
     * The editor's whole hash directory is swept too — it catches leftovers
     * whose per-script deletion failed (e.g. a file still locked). With tabs
     * still open the sweep must wait for the host's last close ack, or it
     * would race the host's flush-saves exactly like a per-script delete.
     */
    disposeEditor(editorId: string): void {
        const closing = new Set<string>();
        for (const [scriptId, entry] of this.scripts) {
            if (entry.editorId === editorId) {
                this.scripts.delete(scriptId);
                closing.add(scriptId);
            }
        }

        const baseDir = this.baseDirByEditor.get(editorId);
        this.baseDirByEditor.delete(editorId);
        const sweepHashDir = (): void => {
            if (baseDir !== undefined) {
                void this.workspace
                    .deleteDirectory(posix.join(baseDir, ScriptUri.hashEditorId(editorId)))
                    .catch((error) => this.notifier.logError(error as Error));
            }
        };

        if (closing.size === 0) {
            sweepHashDir();
        } else {
            let remaining = closing.size;
            for (const scriptId of closing) {
                // Best-effort: push the last <300 ms of typing into the model
                // before asking the host to close. The sender body swallows its
                // own errors so this never rejects; if the webview is already
                // unreachable the keystroke is lost — accepted trade-off, there
                // is no host-side XML fallback on this platform.
                void this.contentSenders.get(scriptId)?.flush();
                this.dropSender(scriptId);
                this.requestClose(scriptId, () => {
                    remaining -= 1;
                    if (remaining === 0) {
                        sweepHashDir();
                    }
                });
            }
        }

        this.extractedByEditor.delete(editorId);
        this.manifestByEditor.delete(editorId);
        this.documentPathByEditor.delete(editorId);
    }

    /**
     * Posts the language pick back to the webview so it persists to the model
     * (via the bpmn-js command stack) and subsequent opens skip the prompt.
     */
    private async sendFormatUpdate(
        editorId: string,
        cmd: OpenScriptEditorCommand,
        scriptFormat: string,
    ): Promise<void> {
        try {
            await this.store.postMessage(
                editorId,
                new UpdateScriptFormatQuery(
                    cmd.elementId,
                    cmd.kind,
                    cmd.listenerIndex,
                    scriptFormat,
                ),
            );
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }
}
