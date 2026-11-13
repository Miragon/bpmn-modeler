/**
 * The IntelliJ host's script tabs behind the core's `ScriptEditorPort`. The
 * bridge writes each script as a real file into the core
 * {@link ScriptFileStore}'s base directory and hands the host its absolute
 * path; a real `VirtualFile` (rather than an in-memory `LightVirtualFile`) is
 * what re-enables IdeaVim and file-based AI tooling in the IntelliJ tab.
 *
 * A tab is addressed by an opaque `scriptId`, the script's `ScriptUri` path,
 * which is also the tab path the core tracks it under; the host is a dumb
 * editor surface keyed by that id. What the bridge keeps itself is the host's
 * side of a close: the file to delete once the host acknowledged it.
 */

import {
    beansFor,
    COMPLEX_TYPES,
    globalFunctionsFor,
    InlineScript,
    MatchedScriptFile,
    methodsForBean,
    NotifierPort,
    OpenScriptTab,
    ScriptEditorPort,
    ScriptFileStore,
    ScriptTabListener,
    ScriptTabTarget,
    ScriptVariableStore,
    SettingsPort,
    toWorkspacePath,
} from "@miragon/bpmn-modeler-core";
import { ScriptKind } from "@miragon/bpmn-modeler-types";

import { Rpc } from "../../../transport/adapter/out/Rpc";
import { METHODS } from "../../../protocol/domain/descriptor";
import { ScriptOpenParams } from "../../../protocol/domain/types";
import { ScriptTabEvents } from "../../port/ScriptTabEvents";

export class BridgeScriptEditor implements ScriptEditorPort, ScriptTabEvents {
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
     * `didClose` per `close`), and letting it run would untrack the freshly
     * re-opened script and unlock its field.
     */
    private readonly swallowNextDidClose = new Set<string>();

    private listener: ScriptTabListener | undefined;

    constructor(
        private readonly rpc: Rpc,
        private readonly notifier: NotifierPort,
        private readonly settings: SettingsPort,
        private readonly scriptFiles: ScriptFileStore,
        private readonly scriptVariables: ScriptVariableStore,
    ) {}

    listen(listener: ScriptTabListener): void {
        this.listener = listener;
    }

    async tabPathOf(_editorId: string, scriptId: string): Promise<string> {
        return scriptId;
    }

    async openTab(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        this.cancelPendingClose(target.tabPath);
        await this.notifyOpen(target, script);
    }

    /** `script/open` again: the host reveals the tab of a known `scriptId` and ignores the content. */
    async revealTab(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        await this.notifyOpen(target, script);
    }

    /**
     * `script/open` always carries the content; the host ignores it when the
     * `scriptId` is already tracked and just reveals the existing tab (so a
     * re-open never clobbers in-flight edits).
     */
    private async notifyOpen(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        const { tabPath: scriptId, editorId, uri, language } = target;

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
     * Writes a script file to disk *without* opening a host tab, the
     * "Generate Script Files" command's whole job. Deliberately does **not**
     * record `filePathByScript`: a later panel-button open then sees no path
     * and rewrites the file from the current model.
     */
    async writeScript(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        this.cancelPendingClose(target.tabPath);
        const filePath = await this.scriptFiles.prepareScriptFile(target.editorId, target.uri);
        await this.scriptFiles.writeFile(filePath, script.content);
    }

    /**
     * The caller is about to (re)write or reveal the script's file, so a late
     * `script/didClose` ack must not tear it down; dropping the
     * `filePathByScript` entry forces a rewrite because the bytes on disk are
     * only the last save, which may trail the model content we were just
     * handed.
     */
    private cancelPendingClose(scriptId: string): void {
        if (this.pendingCloseAcks.delete(scriptId)) {
            this.filePathByScript.delete(scriptId);
            this.swallowNextDidClose.add(scriptId);
        }
    }

    /**
     * Shows a script file the host reported opened outside our own flow
     * (Project view, or the properties-panel button on an untracked file).
     * The host attaches its document listener to the already-open tab; the
     * read only fills `script/open`, and a failed read rejects.
     */
    async adoptTab(scriptId: string, file: MatchedScriptFile, filePath: string): Promise<void> {
        const content = await this.scriptFiles.readFile(filePath);
        this.filePathByScript.set(scriptId, filePath);
        this.rpc.notify(METHODS.scriptOpen, {
            scriptId,
            fileName: file.filename,
            languageId: file.language.languageId,
            filePath,
            content,
            completion: this.completionPayloadFor(file.kind, file.editorId),
        } satisfies ScriptOpenParams);
    }

    /** The host overwrites the open document, echo-guarded; the file follows IntelliJ's own save cycle. */
    async updateTabContent(scriptId: string, content: string): Promise<void> {
        this.rpc.notify(METHODS.scriptUpdateContent, { scriptId, content });
    }

    async closeTab(scriptId: string): Promise<void> {
        this.requestClose(scriptId);
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
     * Re-pushes an editor's webview-extracted model to its open script tabs
     * via `script/updateVariables`, so completion goes live without
     * reopening.
     */
    updateTabVariables(editorId: string, scriptIds: readonly string[]): void {
        const variables = this.scriptVariables.variablesFor(editorId);
        for (const scriptId of scriptIds) {
            this.rpc.notify(METHODS.scriptUpdateVariables, { scriptId, variables });
        }
    }

    /** The file is the only copy the bridge can read; IntelliJ's buffer stays in IntelliJ. */
    async readTabContent(scriptId: string): Promise<string | undefined> {
        const filePath = this.filePathByScript.get(scriptId);
        if (filePath === undefined) {
            return undefined;
        }
        return this.scriptFiles.readFile(filePath).catch(() => undefined);
    }

    /** IntelliJ reports every closed tab, so a tracked script still has one. */
    isTabShown(): boolean {
        return true;
    }

    /** Host reported an edit in the script editor. */
    didChange(scriptId: string, content: string): void {
        this.listener?.didChange(scriptId, content);
    }

    /**
     * Host reported a script tab is closed. For a close *we* requested this is
     * the ack that the host's flush-save finished — run the deferred deletion.
     * For a user-initiated close, the core forgets the tab but the file stays
     * on disk: a re-open must succeed, and dropping the `filePathByScript`
     * entry forces it to rewrite the file with the current model content
     * (IntelliJ reads it from disk, so a stale entry would show stale bytes).
     * The file is deleted only on element deletion or editor dispose.
     */
    async didClose(scriptId: string): Promise<void> {
        // A re-open cancelled the pending close-ack, but the host still emits one
        // `didClose` for that pre-empted close; it must not reach the re-opened tab.
        if (this.swallowNextDidClose.delete(scriptId)) {
            return;
        }
        const pendingAck = this.pendingCloseAcks.get(scriptId);
        if (pendingAck) {
            this.pendingCloseAcks.delete(scriptId);
            pendingAck();
            return;
        }
        this.filePathByScript.delete(scriptId);
        await this.listener?.didClose(scriptId);
    }

    async adoptExternalOpen(filePath: string): Promise<void> {
        await this.listener?.didOpenFile(toWorkspacePath(filePath));
    }

    /**
     * The BPMN editor was disposed: tell the host to close every script tab it
     * opened for that editor.
     *
     * The editor's whole hash directory is swept too — it catches leftovers
     * whose per-script deletion failed (e.g. a file still locked). With tabs
     * still open the sweep must wait for the host's last close ack, or it
     * would race the host's flush-saves exactly like a per-script delete.
     */
    closeEditorTabs(editorId: string, tabs: ReadonlyArray<readonly [string, OpenScriptTab]>): void {
        const closing = tabs.map(([scriptId]) => scriptId);
        const editorScriptDir = this.scriptFiles.releaseEditor(editorId);
        const sweepHashDir = (): void => {
            if (editorScriptDir !== undefined) {
                void this.scriptFiles.deleteFolder(editorScriptDir);
            }
        };

        if (closing.length === 0) {
            sweepHashDir();
        } else {
            let remaining = closing.length;
            for (const scriptId of closing) {
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
