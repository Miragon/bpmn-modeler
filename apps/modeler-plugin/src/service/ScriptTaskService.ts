import {
    ExtensionContext,
    languages,
    QuickPickItem,
    TabChangeEvent,
    TabInputText,
    TextDocumentChangeEvent,
    Uri,
    ViewColumn,
    window,
    workspace,
} from "vscode";

import {
    ScriptKind,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";

import { ScriptLanguage } from "../domain/scriptLanguage";
import { EditorStore } from "../infrastructure/EditorStore";
import { BpmnScriptFileSystem } from "../infrastructure/BpmnScriptFileSystem";
import { VsCodeUI } from "../infrastructure/VsCodeUI";

/** Tracks an open virtual script document. */
interface OpenDocument {
    readonly editorId: string;
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly uri: Uri;
}

/** Quick-Pick item for the script-language prompt. */
interface ScriptLanguageItem extends QuickPickItem {
    readonly format: string;
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
    /** Open virtual documents keyed by URI path. */
    private readonly openDocuments = new Map<string, OpenDocument>();

    /** URI paths currently being written by us — used for echo prevention. */
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
        private readonly editorStore: EditorStore,
        private readonly scriptFs: BpmnScriptFileSystem,
        private readonly vsUI: VsCodeUI,
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
                this.onVirtualDocumentChanged(event),
            ),
            window.tabGroups.onDidChangeTabs((event) =>
                this.onTabsChanged(event),
            ),
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
            const picked = await this.promptScriptLanguage(scriptFormat);
            if (!picked) {
                return;
            }
            effectiveFormat = picked;
            await this.sendFormatUpdate(
                editorId,
                elementId,
                kind,
                listenerIndex,
                picked,
            );
        }

        const lang = new ScriptLanguage(effectiveFormat);
        const editorHash = this.hashEditorId(editorId);
        const slug = this.slugFor(kind, listenerIndex, eventName);
        const scriptUri = Uri.parse(
            `bpmn-script:/${editorHash}/${elementId}/${slug}/script.${lang.extension}`,
        );

        // Already open: just reveal the existing editor.
        if (this.openDocuments.has(scriptUri.path)) {
            const doc = await workspace.openTextDocument(scriptUri);
            await window.showTextDocument(doc, ViewColumn.Beside, true);
            return;
        }

        this.writingGuard.add(scriptUri.path);
        try {
            this.scriptFs.writeFile(
                scriptUri,
                new TextEncoder().encode(content),
            );
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

        for (const entry of this.openDocuments.values()) {
            if (entry.editorId !== editorId) {
                continue;
            }
            let content: string;
            try {
                content = new TextDecoder().decode(
                    this.scriptFs.readFile(entry.uri),
                );
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
            } catch (error) {
                // The webview can transition back to hidden between the
                // reload signal and our replay (e.g. user clicks another
                // tab mid-resync). Re-arm pendingResync so the next reload
                // tries again rather than dropping the edit permanently.
                if (
                    error instanceof Error &&
                    error.message === "The active editor is hidden."
                ) {
                    this.pendingResync.add(editorId);
                } else {
                    this.vsUI.logError(error as Error);
                }
            }
        }
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
        const editorHash = this.hashEditorId(editorId);
        const prefix = `/${editorHash}/`;

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

    // ─── Private helpers ─────────────────────────────────────────────────────

    /**
     * Cleans up tracking state when the user closes a virtual script tab.
     *
     * We listen to tab events rather than `workspace.onDidCloseTextDocument`
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
            if (
                tab.input instanceof TabInputText &&
                tab.input.uri.scheme === "bpmn-script"
            ) {
                this.cleanupClosedScript(tab.input.uri);
            }
        }
    }

    private cleanupClosedScript(uri: Uri): void {
        if (!this.openDocuments.has(uri.path)) {
            return;
        }
        this.openDocuments.delete(uri.path);

        // Each script lives in its own slug directory. Deleting it both
        // frees memory and fires `Deleted` change events, so the next
        // `openScriptEditor`'s `writeFile` (`Created` event) prompts VS
        // Code to refresh any still-cached `TextDocument` for this URI.
        const lastSlash = uri.path.lastIndexOf("/");
        if (lastSlash > 0) {
            this.scriptFs.deleteByPrefix(uri.path.substring(0, lastSlash + 1));
        }
    }

    private async onVirtualDocumentChanged(
        event: TextDocumentChangeEvent,
    ): Promise<void> {
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
            this.scriptFs.writeFile(
                uri,
                new TextEncoder().encode(updatedContent),
            );
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
            // VS Code throws "The active editor is hidden." when the
            // webview's tab isn't visible. The user may still be typing in
            // the virtual editor, so we mark the editor and replay all
            // open documents on the next reload via `resyncOpenDocuments`.
            if (
                error instanceof Error &&
                error.message === "The active editor is hidden."
            ) {
                this.pendingResync.add(entry.editorId);
            } else {
                this.vsUI.logError(error as Error);
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
                new UpdateScriptFormatQuery(
                    elementId,
                    kind,
                    listenerIndex,
                    scriptFormat,
                ),
            );
        } catch (error) {
            this.vsUI.logError(error as Error);
        }
    }

    /**
     * Shows a Quick-Pick listing the languages this extension supports
     * IntelliSense for. The currently configured format (if any) is moved
     * to the top so it remains the default highlighted option even when
     * unrecognised.
     *
     * @returns The picked Camunda format string, or undefined if cancelled.
     */
    private async promptScriptLanguage(
        currentFormat: string,
    ): Promise<string | undefined> {
        const items: ScriptLanguageItem[] = ScriptLanguage.supportedFormats().map(
            (format) => ({
                label: format.charAt(0).toUpperCase() + format.slice(1),
                description: `.${new ScriptLanguage(format).extension}`,
                format,
            }),
        );
        const normalized = currentFormat.toLowerCase().trim();
        items.sort((a, b) => {
            if (a.format === normalized) return -1;
            if (b.format === normalized) return 1;
            return 0;
        });

        const picked = await window.showQuickPick<ScriptLanguageItem>(items, {
            placeHolder: "Select the scripting language",
            title: "Script Language",
        });
        return picked?.format;
    }

    /**
     * Builds the URI path segment that distinguishes scripts living on the
     * same element. Listener kinds embed the index so multiple listeners of
     * the same type (e.g. two `start` execution listeners) don't collide.
     */
    private slugFor(
        kind: ScriptKind,
        listenerIndex: number | undefined,
        eventName: string | undefined,
    ): string {
        if (kind === "script-task") {
            return "script-task";
        }
        const event = eventName ? `-${eventName}` : "";
        const idx = listenerIndex ?? 0;
        return `${kind}-${idx}${event}`;
    }

    /**
     * Creates a short, filesystem-safe hash of an editor ID.
     */
    private hashEditorId(editorId: string): string {
        let hash = 0;
        for (let i = 0; i < editorId.length; i++) {
            const char = editorId.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash |= 0;
        }
        return Math.abs(hash).toString(16);
    }
}
