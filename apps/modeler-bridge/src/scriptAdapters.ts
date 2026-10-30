/**
 * Bridge-only orchestrator for the "Edit Script" feature on a remote host.
 *
 * The VS Code `ScriptTaskService` was deliberately *not* extracted to core: its
 * guts (resync-on-hidden-webview, `tabGroups` tracking) are VS Code accidental
 * complexity that doesn't port — JCEF webviews are never "hidden" the way VS
 * Code editor panels are, so no resync machinery is needed here.
 *
 * The bridge writes each script as a real file into the core
 * {@link ScriptFileStore}'s base directory and hands the host its absolute
 * path; a real `VirtualFile` (rather than an in-memory `LightVirtualFile`) is
 * what re-enables IdeaVim and file-based AI tooling in the IntelliJ tab. The
 * store owns where the files go and their hygiene; this class decides when a
 * script file is deleted.
 *
 * This class owns all BPMN/element knowledge: it addresses scripts by a stable
 * `ScriptUri` and hands the host an opaque `scriptId`; the host is a dumb
 * editor surface keyed by that id, and host-reported edits map back to the
 * right webview here.
 */

import {
    beansFor,
    COMPLEX_TYPES,
    EditorSessionStore,
    globalFunctionsFor,
    InlineScript,
    matchScriptFile,
    methodsForBean,
    NotifierPort,
    PickerPort,
    ScriptEditorPort,
    ScriptFileStore,
    ScriptLanguage,
    scriptLanguagePrompt,
    ScriptMaterialization,
    ScriptSourceChange,
    ScriptUri,
    ScriptVariableStore,
    SettingsPort,
    toWorkspacePath,
} from "@miragon/bpmn-modeler-core";
import {
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";
import {
    AsyncDebounced,
    asyncDebounce,
    OpenScriptEditorRef,
    ScriptKind,
} from "@miragon/bpmn-modeler-types";

import { Rpc } from "./rpc";
import { METHODS } from "./protocol/descriptor";
import { ScriptOpenParams } from "./protocol/types";

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
export class BridgeScriptEditor implements ScriptEditorPort {
    private readonly scripts = new Map<string, TrackedScript>();

    // Absolute file path per open script, retained for deletion on close.
    private readonly filePathByScript = new Map<string, string>();

    /**
     * Deferred cleanups keyed by scriptId, armed when *we* send `script/close`
     * and run on the host's `script/didClose` ack. The host flush-saves the
     * closing document before acking; deleting the file eagerly would race
     * that save, which would rewrite the just-deleted file as an orphan no
     * cleanup path owns. A lost ack (host death) leaves the directory for the
     * next process start's orphan sweep.
     */
    private readonly pendingCloseAcks = new Map<string, () => void>();

    /**
     * scriptIds whose *next* `script/didClose` must be ignored. Armed when a
     * re-open cancels an in-flight close-ack: the host still emits exactly one
     * `didClose` for the pre-empted close (single-shot host contract — one
     * `didClose` per `close`), and letting it run would delete the freshly
     * re-tracked entry and broadcast a lock set missing the re-opened tab.
     */
    private readonly swallowNextDidClose = new Set<string>();

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

    constructor(
        private readonly store: EditorSessionStore,
        private readonly picker: PickerPort,
        private readonly rpc: Rpc,
        private readonly notifier: NotifierPort,
        private readonly settings: SettingsPort,
        private readonly scriptFiles: ScriptFileStore,
        private readonly scriptVariables: ScriptVariableStore,
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
    async open(editorId: string, script: InlineScript): Promise<void> {
        const target = await this.resolveScriptTarget(script, editorId);
        if (!target) {
            return; // language picker cancelled
        }
        const { scriptId, uri, lang } = target;

        // Write the real file only on first open: a re-open just reveals the
        // existing tab, and rewriting the file underneath IntelliJ's (possibly
        // unsaved) document would trigger its external-change conflict dialog.
        let filePath = this.filePathByScript.get(scriptId);
        if (filePath === undefined) {
            try {
                const writtenPath = await this.scriptFiles.prepareScriptFile(editorId, uri);
                await this.scriptFiles.writeFile(writtenPath, script.content);
                this.filePathByScript.set(scriptId, writtenPath);
                filePath = writtenPath;
            } catch (error) {
                // Without a `filePath` the host opens a LightVirtualFile from
                // `content`, so an unwritable disk or a failed folder lookup
                // degrades to the pre-real-file behaviour instead of failing.
                this.notifier.logError(error as Error);
            }
        }

        this.scripts.set(scriptId, {
            editorId,
            elementId: script.elementId,
            kind: script.kind,
            listenerIndex: script.listenerIndex,
        });

        // `fileName` carries the extension so the host infers the FileType for
        // highlighting; `content` is honoured only on first open (see above).
        this.rpc.notify(METHODS.scriptOpen, {
            scriptId,
            fileName: uri.filename,
            languageId: lang.languageId,
            filePath,
            content: script.content,
            completion: this.completionPayloadFor(script.kind, editorId),
        } satisfies ScriptOpenParams);

        // A tab now owns this script — lock the matching webview panel field.
        this.broadcastOpenScripts(editorId);
    }

    /**
     * Builds the kind-scoped completion catalog shipped in `script/open` so the
     * thin Kotlin host never needs to know which beans belong to which kind — it
     * just renders what it is handed (VS Code's `registerCompletionItemProvider`
     * has no PSI-based analogue, so the host drives a `CompletionContributor` off
     * this payload instead).
     *
     * The SPIN globals (`S`/`JSON`) and the type→methods table are gated here in
     * the bridge (single source): off → empty, so the contributor renders nothing
     * and needs no gate of its own. Shipping the full `COMPLEX_TYPES` map when on
     * is harmless — the host only consults `types` on a variable's `typeHint`
     * lookup, and `SpinJsonNode` is the only hint the producer heuristic stamps.
     */
    private completionPayloadFor(kind: ScriptKind, editorId: string) {
        const spinOn = this.settings.getScriptingSpin();
        return {
            beans: beansFor(kind).map((bean) => ({
                name: bean.name,
                type: bean.type,
                description: bean.description,
                // Empty for value beans (e.g. `eventName: String`) — correct,
                // they have no member completion.
                methods: methodsForBean(bean),
            })),
            variables: this.scriptVariables.variablesFor(editorId),
            globals: spinOn ? globalFunctionsFor(kind) : [],
            types: spinOn
                ? Object.fromEntries(COMPLEX_TYPES.map((type) => [type.name, type.methods]))
                : {},
        };
    }

    /**
     * Writes a script file to disk *without* opening a host tab, tracking it, or
     * locking the panel — the "Generate Script Files" command's whole job. Live
     * sync starts only when the user opens the file (see {@link adoptExternalOpen}).
     * A failed write rejects.
     *
     * Deliberately does **not** record `filePathByScript`: a later panel-button
     * open then sees no path and rewrites the file from the current model, keeping
     * the panel button's rewrite-from-model semantics. A script already owned by
     * an open tab is left untouched (`alreadyOpen`) — its buffer is authoritative.
     */
    async materialize(editorId: string, script: InlineScript): Promise<ScriptMaterialization> {
        const target = await this.resolveScriptTarget(script, editorId);
        if (!target) {
            return { kind: "cancelled" };
        }

        if (this.scripts.has(target.scriptId)) {
            return { kind: "alreadyOpen" };
        }

        const filePath = await this.scriptFiles.prepareScriptFile(editorId, target.uri);
        await this.scriptFiles.writeFile(filePath, script.content);
        return { kind: "written" };
    }

    /**
     * Resolves a script's on-disk identity for {@link open} and
     * {@link materialize}: prompts for a language when the model's
     * `scriptFormat` is missing or unsupported (persisting the pick so the next
     * open skips the prompt) and builds the {@link ScriptUri}. `undefined` when
     * the picker was cancelled.
     *
     * Also cancels a pending close-ack deletion for the same script: the caller
     * is about to (re)write or reveal the file, so a late `script/didClose` ack
     * must not tear it down; dropping the `filePathByScript` entry forces a
     * rewrite because the bytes on disk are only the last save, which may trail
     * the model content we were just handed.
     */
    private async resolveScriptTarget(
        script: InlineScript,
        editorId: string,
    ): Promise<{ scriptId: string; uri: ScriptUri; lang: ScriptLanguage } | undefined> {
        let effectiveFormat = script.scriptFormat;
        if (!ScriptLanguage.isSupported(script.scriptFormat)) {
            const picked = await this.picker.choose(scriptLanguagePrompt(script.scriptFormat));
            if (!picked) {
                return undefined;
            }
            effectiveFormat = picked;
            await this.sendFormatUpdate(editorId, script, picked);
        }

        const lang = new ScriptLanguage(effectiveFormat);
        const uri = new ScriptUri(
            editorId,
            script.elementId,
            script.kind,
            script.listenerIndex,
            script.eventName,
            lang.extension,
        );
        const scriptId = uri.toString();

        if (this.pendingCloseAcks.delete(scriptId)) {
            this.filePathByScript.delete(scriptId);
            // The close we just pre-empted still yields one host `didClose`;
            // swallow it so it can't tear down this re-tracked script.
            this.swallowNextDidClose.add(scriptId);
        }
        return { scriptId, uri, lang };
    }

    /**
     * Adopts a script file the host reports opened *outside* our own flow (Project
     * view, or the properties-panel button on an untracked file) so live sync into
     * the BPMN model starts from that moment. Without it, host keystrokes would be
     * dropped: {@link didChange} filters strictly by the tracking map.
     *
     * Adoption is track + notify `script/open` + lock only — the host attaches its
     * document listener to the already-open tab. No content is pushed toward the
     * model at adopt time: disk becomes truth on the first edit after opening. A
     * file whose editor session isn't live, that sits outside the base directory,
     * or that is an ambient sibling (`camunda.d.ts`/`jsconfig.json`) is ignored.
     */
    async adoptExternalOpen(filePath: string): Promise<void> {
        const normalized = toWorkspacePath(filePath);
        const match = matchScriptFile(normalized, this.store.getEditorIds());
        if (!match) {
            return;
        }

        if (!(await this.scriptFiles.adopt(match.editorId, normalized))) {
            return;
        }

        // scriptId is the ScriptUri relative path — identical to what open() keys
        // by, so a subsequent didChange/close maps to the same tracked entry.
        const scriptId = match.scriptId;
        if (this.scripts.has(scriptId)) {
            return;
        }

        let content: string;
        try {
            content = await this.scriptFiles.readFile(normalized);
        } catch (error) {
            this.notifier.logError(error as Error);
            return;
        }

        this.filePathByScript.set(scriptId, normalized);
        this.scripts.set(scriptId, {
            editorId: match.editorId,
            elementId: match.elementId,
            kind: match.kind,
            listenerIndex: match.listenerIndex,
        });

        this.rpc.notify(METHODS.scriptOpen, {
            scriptId,
            fileName: match.filename,
            languageId: match.language.languageId,
            filePath: normalized,
            content,
            completion: this.completionPayloadFor(match.kind, match.editorId),
        } satisfies ScriptOpenParams);

        // A tab now owns this script — lock the matching webview panel field.
        this.broadcastOpenScripts(match.editorId);
    }

    /**
     * Re-broadcasts the open-script set for an editor so the webview's
     * properties-panel lock is restored after a reload. Called on the
     * `GetBpmnModelerSettingCommand` handshake, the same signal the webview
     * sends whenever it (re)initialises.
     */
    resync(editorId: string): void {
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
    applyModelChange(editorId: string, change: ScriptSourceChange): void {
        for (const [scriptId, entry] of this.scripts) {
            if (
                entry.editorId !== editorId ||
                entry.elementId !== change.elementId ||
                entry.kind !== change.kind ||
                (entry.listenerIndex ?? 0) !== (change.listenerIndex ?? 0)
            ) {
                continue;
            }
            if (change.content === undefined) {
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
                    content: change.content,
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
        return this.scriptFiles.deleteScript(filePath);
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
     * Re-pushes an editor's webview-extracted model to every open script tab of
     * that editor via `script/updateVariables`, so completion goes live without
     * reopening. Scoped to the originating editor's scripts only.
     */
    variablesChanged(editorId: string): void {
        const variables = this.scriptVariables.variablesFor(editorId);
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
     * For a user-initiated close, drop tracking and release the lock but leave
     * the file on disk: a re-open must succeed, and dropping the
     * `filePathByScript` entry forces `open` to rewrite the file with the
     * current model content (IntelliJ reads it from disk, so a stale entry
     * would show stale bytes). The file is deleted only on element deletion or
     * editor dispose.
     */
    async didClose(scriptId: string): Promise<void> {
        // A re-open cancelled the pending close-ack, but the host still emits one
        // `didClose` for that pre-empted close. Swallow it *before* touching the
        // sender so the re-opened tab's live sender and tracking are preserved.
        if (this.swallowNextDidClose.delete(scriptId)) {
            return;
        }
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
        // Capture the owner before removing so the lock release reflects it.
        const editorId = this.scripts.get(scriptId)?.editorId;
        this.scripts.delete(scriptId);
        // Drop the path entry (not the file) so a re-open rewrites fresh content
        // rather than revealing a stale tab; the file survives the close.
        this.filePathByScript.delete(scriptId);
        if (editorId !== undefined) {
            this.broadcastOpenScripts(editorId);
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

        const editorScriptDir = this.scriptFiles.releaseEditor(editorId);
        const sweepHashDir = (): void => {
            if (editorScriptDir !== undefined) {
                void this.scriptFiles.deleteFolder(editorScriptDir);
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
    }

    /**
     * Posts the language pick back to the webview so it persists to the model
     * (via the bpmn-js command stack) and subsequent opens skip the prompt.
     */
    private async sendFormatUpdate(
        editorId: string,
        script: InlineScript,
        scriptFormat: string,
    ): Promise<void> {
        try {
            await this.store.postMessage(
                editorId,
                new UpdateScriptFormatQuery(
                    script.elementId,
                    script.kind,
                    script.listenerIndex,
                    scriptFormat,
                ),
            );
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }
}
