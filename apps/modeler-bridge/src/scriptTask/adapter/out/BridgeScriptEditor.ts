/**
 * Bridge-only orchestrator for the "Edit Script" feature on a remote host.
 * JCEF webviews are never "hidden" the way VS Code editor panels are, so
 * unlike `ScriptTaskService` it needs no resync machinery.
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
    OpenScriptTabs,
    ScriptContentStream,
    ScriptEditorPort,
    ScriptFileStore,
    ScriptMaterialization,
    ScriptSourceChange,
    ScriptTarget,
    ScriptTargetResolver,
    ScriptVariableStore,
    SettingsPort,
    toWorkspacePath,
} from "@miragon/bpmn-modeler-core";
import { UpdateOpenScriptEditorsQuery } from "@miragon/bpmn-modeler-shared";
import { ScriptKind } from "@miragon/bpmn-modeler-types";

import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { ScriptOpenParams } from "../../../protocol/domain/types";
import { ScriptTabEvents } from "../../port/ScriptTabEvents";

/**
 * Per-script tracking lives here, never on the host: re-opening the same script
 * resolves to the same `scriptId`, so the host can reveal an existing tab
 * instead of duplicating it, and `didChange` can be mapped back to the element
 * without the host knowing anything about BPMN.
 */
export class BridgeScriptEditor implements ScriptEditorPort, ScriptTabEvents {
    private readonly scripts = new OpenScriptTabs();

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

    /** Keyed by `scriptId`. JCEF webviews never hide, so no edit waits for a resync. */
    private readonly contentStream: ScriptContentStream;

    constructor(
        private readonly store: EditorSessionStore,
        private readonly targets: ScriptTargetResolver,
        private readonly rpc: Rpc,
        private readonly notifier: NotifierPort,
        private readonly settings: SettingsPort,
        private readonly scriptFiles: ScriptFileStore,
        private readonly scriptVariables: ScriptVariableStore,
    ) {
        this.contentStream = new ScriptContentStream(store, notifier);
    }

    /**
     * Opens (or reveals) an inline script in a host text editor.
     *
     * `script/open` always carries the content; the host ignores it when the `scriptId` is already tracked and
     * just reveals the existing tab (so a re-open never clobbers in-flight edits).
     */
    async open(editorId: string, script: InlineScript): Promise<void> {
        const target = await this.resolveScriptTarget(script, editorId);
        if (!target) {
            return; // language picker cancelled
        }
        const { scriptId, uri, language } = target;

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

        this.scripts.track(scriptId, {
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
            languageId: language.languageId,
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

        const plan = this.scripts.materializationOf(target.scriptId);
        if (plan.kind === "alreadyOpen") {
            return plan;
        }

        const filePath = await this.scriptFiles.prepareScriptFile(editorId, target.uri);
        await this.scriptFiles.writeFile(filePath, script.content);
        return { kind: "written" };
    }

    /**
     * The core's target for a script, keyed by its `scriptId`, for
     * {@link open} and {@link materialize}. `undefined` when the language
     * prompt was dismissed.
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
    ): Promise<(ScriptTarget & { scriptId: string }) | undefined> {
        const target = await this.targets.resolve(editorId, script);
        if (!target) {
            return undefined;
        }
        const scriptId = target.uri.toString();

        if (this.pendingCloseAcks.delete(scriptId)) {
            this.filePathByScript.delete(scriptId);
            // The close we just pre-empted still yields one host `didClose`;
            // swallow it so it can't tear down this re-tracked script.
            this.swallowNextDidClose.add(scriptId);
        }
        return { ...target, scriptId };
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
        if (this.scripts.isOpen(scriptId)) {
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
        this.scripts.track(scriptId, {
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
        const found = this.scripts.find(editorId, change);
        if (!found) {
            return;
        }
        const [scriptId] = found;
        if (change.content === undefined) {
            // Surface gone: drop the sender so a pending keystroke can't
            // fire against a deleted element.
            this.contentStream.stop(scriptId);
            this.scripts.untrack(scriptId);
            this.requestClose(scriptId);
            this.broadcastOpenScripts(editorId);
        } else {
            // Canvas undo/redo overwrites the tab; cancel any pending
            // keystroke so it can't fire afterwards and clobber the undo.
            this.contentStream.cancel(scriptId);
            this.rpc.notify(METHODS.scriptUpdateContent, {
                scriptId,
                content: change.content,
            });
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
     * `scriptId` is the tab path: the `ScriptUri` already ends in the
     * human-facing filename, so no extra tracking is needed.
     */
    private broadcastOpenScripts(editorId: string): void {
        this.store
            .postMessage(
                editorId,
                new UpdateOpenScriptEditorsQuery(this.scripts.openScriptsOf(editorId)),
            )
            .catch((error) => this.notifier.logError(error as Error));
    }

    /**
     * Re-pushes an editor's webview-extracted model to every open script tab of
     * that editor via `script/updateVariables`, so completion goes live without
     * reopening. Scoped to the originating editor's scripts only.
     */
    variablesChanged(editorId: string): void {
        const variables = this.scriptVariables.variablesFor(editorId);
        for (const [scriptId] of this.scripts.ofEditor(editorId)) {
            this.rpc.notify(METHODS.scriptUpdateVariables, { scriptId, variables });
        }
    }

    /** Host reported an edit in the script editor → push it into the owning webview. */
    didChange(scriptId: string, content: string): void {
        const entry = this.scripts.get(scriptId);
        if (!entry) {
            return;
        }
        this.contentStream.push(scriptId, entry, content);
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
        await this.contentStream.flush(scriptId);
        this.contentStream.stop(scriptId);

        const pendingAck = this.pendingCloseAcks.get(scriptId);
        if (pendingAck) {
            this.pendingCloseAcks.delete(scriptId);
            pendingAck();
            return;
        }
        // Capture the owner before removing so the lock release reflects it.
        const editorId = this.scripts.untrack(scriptId)?.editorId;
        // Drop the path entry (not the file) so a re-open rewrites fresh content
        // rather than revealing a stale tab; the file survives the close.
        this.filePathByScript.delete(scriptId);
        if (editorId !== undefined) {
            this.broadcastOpenScripts(editorId);
        }
    }

    /**
     * The BPMN editor was disposed: tell the host to close every script tab it
     * opened for that editor and drop their tracking.
     *
     * The editor's whole hash directory is swept too — it catches leftovers
     * whose per-script deletion failed (e.g. a file still locked). With tabs
     * still open the sweep must wait for the host's last close ack, or it
     * would race the host's flush-saves exactly like a per-script delete.
     */
    disposeEditor(editorId: string): void {
        const closing = new Set<string>();
        for (const [scriptId] of this.scripts.ofEditor(editorId)) {
            this.scripts.untrack(scriptId);
            closing.add(scriptId);
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
                void this.contentStream.flush(scriptId);
                this.contentStream.stop(scriptId);
                this.requestClose(scriptId, () => {
                    remaining -= 1;
                    if (remaining === 0) {
                        sweepHashDir();
                    }
                });
            }
        }
    }
}
