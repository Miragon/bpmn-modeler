import {
    ExtensionContext,
    languages,
    TabChangeEvent,
    TabInputText,
    TextDocumentChangeEvent,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";

import {
    OpenScriptEditorRef,
    ScriptKind,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";

import { ScriptLanguage } from "@miragon/bpmn-modeler-core";
import { ScriptUri } from "@miragon/bpmn-modeler-core";
import { EditorSessionStore } from "@miragon/bpmn-modeler-core";
import { BpmnScriptFileSystem } from "../infrastructure/BpmnScriptFileSystem";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { VsCodePicker } from "../../shared/infrastructure/VsCodePicker";

/**
 * Tracks an open virtual script document.
 */
interface OpenDocument {
    readonly editorId: string;
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly uri: Uri;
}

/**
 * Manages virtual script documents for BPMN script tasks and listener scripts.
 *
 * Opens inline scripts in full VS Code editor tabs backed by a
 * `FileSystemProvider` virtual filesystem, giving users syntax highlighting,
 * IntelliSense, and AI-tool support. Three surfaces are supported:
 *
 * 1. `bpmn:ScriptTask` — `script` direct property.
 * 2. `camunda:ExecutionListener` — nested `script` element on any flow node.
 * 3. `camunda:TaskListener` — nested `script` element on a `bpmn:UserTask`.
 *
 * Each kind is routed to a distinct virtual-filesystem path segment so
 * multiple scripts on the same element coexist; the slug is also what
 * {@link ScriptCompletionProvider} parses to decide which Camunda beans
 * (`execution`, `task`, `eventName`) are in scope for completions.
 *
 * Edits in the virtual editor are pushed back to the BPMN modeler webview as
 * {@link UpdateScriptContentQuery} so the modeler can write them to the
 * correct moddle property and persist via the bpmn-js command stack.
 */
export class ScriptTaskService {
    // Open virtual documents keyed by URI path.
    private readonly openDocuments = new Map<string, OpenDocument>();

    // URI paths currently being written by us — used for echo prevention.
    private readonly writingGuard = new Set<string>();

    /**
     * Editor IDs whose webview was hidden when a script change occurred.
     *
     * VS Code hides a webview when its editor tab is not visible (e.g. the
     * user has switched to another tab); `editorStore.postMessage` then
     * throws "The active editor is hidden." — we'd silently drop the edit
     * if we just logged that error. Instead we mark the editor here and
     * replay all open virtual documents the next time the webview comes
     * back (signalled by it sending `GetBpmnModelerSettingCommand` after a
     * reload, which the controller forwards to {@link resyncOpenDocuments}).
     */
    private readonly pendingResync = new Set<string>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly scriptFs: BpmnScriptFileSystem,
        private readonly notifier: VsCodeNotifier,
        private readonly picker: VsCodePicker,
    ) {}

    /**
     * Registers the workspace listeners that drive the virtual-script
     * lifecycle: edits in a script tab are propagated back to the BPMN
     * modeler, and tab closures clean up tracking state so a re-open
     * always reads the current BPMN content.
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.onDidChangeTextDocument((event) =>
                // VS Code doesn't await this async listener, so a rejection would
                // otherwise surface as an unhandled promise rejection.
                this.onVirtualDocumentChanged(event).catch((error) => {
                    this.notifier.logError(
                        error instanceof Error ? error : new Error(String(error)),
                    );
                }),
            ),
            window.tabGroups.onDidChangeTabs((event) => this.onTabsChanged(event)),
        );
    }

    /**
     * Opens an inline script in a VS Code editor tab.
     *
     * Creates a virtual document in the `bpmn-script` filesystem, writes the
     * current script content into it, and opens it beside the BPMN modeler.
     *
     * @param editorId Document URI of the BPMN editor.
     * @param elementId The BPMN element ID hosting the script (parent
     *   element for listener kinds).
     * @param kind Which surface the script lives on.
     * @param listenerIndex For listener kinds, the index within the parent's
     *   filtered list of listeners of that type. Undefined for `script-task`.
     * @param eventName For listener kinds, the listener's `event` attribute
     *   (e.g. `"start"`, `"create"`); used for the editor tab title.
     * @param scriptFormat The Camunda `scriptFormat` value (e.g. `"javascript"`).
     * @param content The current inline script content.
     */
    async openScriptEditor(
        editorId: string,
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        eventName: string | undefined,
        scriptFormat: string,
        content: string,
    ): Promise<void> {
        // Prompt only when the BPMN model's scriptFormat is missing or set
        // to a language we don't ship IntelliSense for. A successful pick
        // is persisted back to the model so the next open skips the prompt.
        let effectiveFormat = scriptFormat;
        if (!ScriptLanguage.isSupported(scriptFormat)) {
            const picked = await this.picker.pickScriptLanguage(scriptFormat);
            if (!picked) {
                return;
            }
            effectiveFormat = picked;
            await this.sendFormatUpdate(editorId, elementId, kind, listenerIndex, picked);
        }

        const lang = new ScriptLanguage(effectiveFormat);
        const scriptUri = Uri.parse(
            new ScriptUri(
                editorId,
                elementId,
                kind,
                listenerIndex,
                eventName,
                lang.extension,
            ).toString(),
        );

        /**
         * Already open: just reveal the existing editor.
         */
        if (this.openDocuments.has(scriptUri.path)) {
            const doc = await workspace.openTextDocument(scriptUri);
            await window.showTextDocument(doc, ViewColumn.Beside, true);
            return;
        }

        this.writingGuard.add(scriptUri.path);
        try {
            this.scriptFs.writeFile(scriptUri, new TextEncoder().encode(content));
        } finally {
            this.writingGuard.delete(scriptUri.path);
        }

        const doc = await workspace.openTextDocument(scriptUri);
        await languages.setTextDocumentLanguage(doc, lang.languageId);
        await window.showTextDocument(doc, ViewColumn.Beside, true);

        this.openDocuments.set(scriptUri.path, {
            editorId,
            elementId,
            kind,
            listenerIndex,
            uri: scriptUri,
        });

        // Tell the webview a tab now owns this script so the panel field locks.
        this.broadcastOpenScripts(editorId);
    }

    /**
     * Re-broadcasts the current open-script set for the given editor so the
     * webview's properties-panel lock is restored after a reload.
     *
     * Kept separate from {@link resyncOpenDocuments}: that method's
     * `pendingResync` early-return must stay content-only (it replays edits
     * buffered while hidden), whereas the lock must refresh on *every*
     * reload handshake regardless of whether a hidden edit occurred.
     */
    syncLockState(editorId: string): void {
        this.broadcastOpenScripts(editorId);
    }

    /**
     * Posts the full set of open inline-script editors for `editorId` so the
     * webview can lock the matching panel fields. Called on every open/close
     * and on the reload handshake — a full-set broadcast is idempotent, so a
     * redundant one after a reload does no harm.
     *
     * A hidden webview makes `postMessage` throw; that is swallowed because the
     * `GetBpmnModelerSettingCommand` reload handshake re-broadcasts once the
     * webview is visible again — the same invariant {@link resyncOpenDocuments}
     * relies on for content.
     */
    private broadcastOpenScripts(editorId: string): void {
        const openScripts: OpenScriptEditorRef[] = [];
        for (const entry of this.openDocuments.values()) {
            if (entry.editorId !== editorId) {
                continue;
            }
            const path = entry.uri.path;
            openScripts.push({
                elementId: entry.elementId,
                kind: entry.kind,
                listenerIndex: entry.listenerIndex,
                fileName: path.substring(path.lastIndexOf("/") + 1),
            });
        }

        this.editorStore
            .postMessage(editorId, new UpdateOpenScriptEditorsQuery(openScripts))
            .catch((error: unknown) => {
                if (error instanceof Error && error.message === "The active editor is hidden.") {
                    return;
                }
                this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            });
    }

    /**
     * Maps an open script URI path back to its owning BPMN editor id, or
     * `undefined` if no script is tracked at that path. The "Declare in variable
     * manifest" code action needs this to resolve which diagram's manifest the
     * unknown variable belongs to — the script URI itself carries only a one-way
     * hash of the editor id, not the original document path.
     */
    getEditorIdForScriptUri(uriPath: string): string | undefined {
        return this.openDocuments.get(uriPath)?.editorId;
    }

    /**
     * Re-sends the current content of every open virtual document for the
     * given editor as `UpdateScriptContentQuery` messages.
     *
     * Called by the controller when the webview reloads (which happens
     * implicitly whenever VS Code hides and re-shows it — e.g. tab
     * switching or window restore). Without this, edits made while the
     * webview was hidden would be lost: `postMessage` to a hidden webview
     * throws and the queue is not buffered.
     *
     * No-op when the editor isn't in the pending-resync set, so reloads
     * unrelated to a hidden-edit cycle don't trigger redundant work.
     */
    async resyncOpenDocuments(editorId: string): Promise<void> {
        if (!this.pendingResync.has(editorId)) {
            return;
        }
        this.pendingResync.delete(editorId);

        const deferredCleanups: Uri[] = [];
        for (const entry of this.openDocuments.values()) {
            if (entry.editorId !== editorId) {
                continue;
            }
            let content: string;
            try {
                content = new TextDecoder().decode(this.scriptFs.readFile(entry.uri));
            } catch {
                continue;
            }
            try {
                await this.editorStore.postMessage(
                    editorId,
                    new UpdateScriptContentQuery(
                        entry.elementId,
                        entry.kind,
                        entry.listenerIndex,
                        content,
                    ),
                );
                /**
                 * The user may have closed the script tab while the BPMN
                 * webview was hidden — `cleanupClosedScript` deferred the
                 * cleanup until we replayed. Now that we have, finish it.
                 */
                if (!this.isUriOpenInAnyTab(entry.uri)) {
                    deferredCleanups.push(entry.uri);
                }
            } catch (error) {
                /**
                 * The webview can transition back to hidden between the
                 * reload signal and our replay (e.g. user clicks another
                 * tab mid-resync). Re-arm pendingResync so the next reload
                 * tries again rather than dropping the edit permanently.
                 */
                if (error instanceof Error && error.message === "The active editor is hidden.") {
                    this.pendingResync.add(editorId);
                } else {
                    this.notifier.logError(error as Error);
                }
            }
        }
        for (const uri of deferredCleanups) {
            this.performCleanup(uri);
        }

        // A hidden-edit replay may have closed tabs (handled above) or left the
        // set unchanged; either way refresh the lock now that the webview — which
        // dropped its lock state on reload — is visible again.
        this.broadcastOpenScripts(editorId);
    }

    /**
     * Cleans up all virtual script documents associated with a BPMN editor
     * and closes any orphaned script tabs.
     *
     * Called when the BPMN editor panel is disposed. Internal state is
     * cleared synchronously before tabs are closed so the {@link onTabsChanged}
     * handler is a no-op for these URIs.
     */
    disposeForEditor(editorId: string): void {
        const prefix = ScriptUri.editorPathPrefix(editorId);

        const orphanedPaths = new Set<string>();
        for (const [path, entry] of this.openDocuments) {
            if (entry.editorId === editorId) {
                orphanedPaths.add(path);
            }
        }
        for (const path of orphanedPaths) {
            this.openDocuments.delete(path);
        }

        this.pendingResync.delete(editorId);

        if (orphanedPaths.size > 0) {
            for (const group of window.tabGroups.all) {
                for (const tab of group.tabs) {
                    if (
                        tab.input instanceof TabInputText &&
                        tab.input.uri.scheme === "bpmn-script" &&
                        orphanedPaths.has(tab.input.uri.path)
                    ) {
                        void window.tabGroups.close(tab);
                    }
                }
            }
        }

        this.scriptFs.deleteByPrefix(prefix);
    }

    /**
     * Tab events are used instead of `workspace.onDidCloseTextDocument`
     * because the latter fires only when VS Code actually disposes the
     * `TextDocument` — disposal is debounced so the doc lingers in an
     * internal cache after the tab closes (so quick reopens are cheap).
     * While the doc lingers, our `openDocuments` map would keep the stale
     * entry and the next `openScriptEditor` call for the same URI would hit
     * the "already open" branch and reveal the cached doc with outdated
     * content (e.g. switching language groovy → js → groovy and reopening).
     *
     * Safe no-op when {@link disposeForEditor} has already removed the
     * entry — it clears state before programmatically closing tabs.
     */
    private onTabsChanged(event: TabChangeEvent): void {
        for (const tab of event.closed) {
            if (tab.input instanceof TabInputText && tab.input.uri.scheme === "bpmn-script") {
                this.cleanupClosedScript(tab.input.uri);
            }
        }
    }

    private isUriOpenInAnyTab(uri: Uri): boolean {
        const target = uri.toString();
        for (const group of window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (tab.input instanceof TabInputText && tab.input.uri.toString() === target) {
                    return true;
                }
            }
        }
        return false;
    }

    private cleanupClosedScript(uri: Uri): void {
        const entry = this.openDocuments.get(uri.path);
        if (!entry) {
            return;
        }

        /**
         * Tab moves between groups arrive as a close + open pair for the
         * same URI; if the URI is still open in another tab, this was a
         * move and the entry must stay alive for keystroke tracking.
         */
        if (this.isUriOpenInAnyTab(uri)) {
            return;
        }

        /**
         * Real close, but the BPMN webview was hidden when the user typed
         * — `pendingResync` carries the buffered edit, and the only copy
         * of its content is the virtual file. Defer cleanup until the
         * resync runs so it can read scriptFs and replay before we delete.
         */
        if (this.pendingResync.has(entry.editorId)) {
            return;
        }

        this.performCleanup(uri);
    }

    private performCleanup(uri: Uri): void {
        // Capture the owning editor before deleting so the lock broadcast below
        // reflects the removal — the entry is gone by the time we post.
        const editorId = this.openDocuments.get(uri.path)?.editorId;
        this.openDocuments.delete(uri.path);

        if (editorId !== undefined) {
            this.broadcastOpenScripts(editorId);
        }

        // Each script lives in its own slug directory. Deleting it both
        // frees memory and fires `Deleted` change events, so the next
        // `openScriptEditor`'s `writeFile` (`Created` event) prompts VS
        // Code to refresh any still-cached `TextDocument` for this URI.
        const lastSlash = uri.path.lastIndexOf("/");
        if (lastSlash > 0) {
            this.scriptFs.deleteByPrefix(uri.path.substring(0, lastSlash + 1));
        }
    }

    private async onVirtualDocumentChanged(event: TextDocumentChangeEvent): Promise<void> {
        const uri = event.document.uri;

        if (uri.scheme !== "bpmn-script") {
            return;
        }
        if (event.contentChanges.length === 0) {
            return;
        }
        if (this.writingGuard.has(uri.path)) {
            return;
        }

        const entry = this.openDocuments.get(uri.path);
        if (!entry) {
            return;
        }

        const updatedContent = event.document.getText();

        // Keep the in-memory filesystem in sync with the editor's buffer so
        // a subsequent readFile (e.g. from another extension) returns the
        // current content rather than the original write.
        this.writingGuard.add(uri.path);
        try {
            this.scriptFs.writeFile(uri, new TextEncoder().encode(updatedContent));
        } finally {
            this.writingGuard.delete(uri.path);
        }

        try {
            await this.editorStore.postMessage(
                entry.editorId,
                new UpdateScriptContentQuery(
                    entry.elementId,
                    entry.kind,
                    entry.listenerIndex,
                    updatedContent,
                ),
            );
        } catch (error) {
            /**
             * VS Code throws "The active editor is hidden." when the
             * webview's tab isn't visible. The user may still be typing in
             * the virtual editor, so we mark the editor and replay all
             * open documents on the next reload via `resyncOpenDocuments`.
             */
            if (error instanceof Error && error.message === "The active editor is hidden.") {
                this.pendingResync.add(entry.editorId);
            } else {
                this.notifier.logError(error as Error);
            }
        }
    }

    /**
     * Posts a script-format choice back to the BPMN modeler webview so the
     * pick (e.g. via Quick-Pick) is persisted to the model and subsequent
     * opens skip the prompt.
     */
    private async sendFormatUpdate(
        editorId: string,
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        scriptFormat: string,
    ): Promise<void> {
        try {
            await this.editorStore.postMessage(
                editorId,
                new UpdateScriptFormatQuery(elementId, kind, listenerIndex, scriptFormat),
            );
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }
}
