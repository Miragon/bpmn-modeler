import { posix } from "path";

import {
    ExtensionContext,
    languages,
    Range,
    TabChangeEvent,
    TabInputText,
    TextDocument,
    TextDocumentChangeEvent,
    Uri,
    ViewColumn,
    window,
    workspace,
    WorkspaceEdit,
} from "vscode";

import { ScriptKind } from "@miragon/bpmn-modeler-types";

import {
    generateCamundaDts,
    InlineScript,
    joinWorkspacePath,
    MatchedScriptFile,
    OpenScriptTab,
    SCRIPT_JSCONFIG,
    ScriptContentUpdate,
    ScriptEditorPort,
    ScriptFileStore,
    ScriptLanguage,
    ScriptTabListener,
    ScriptTabTarget,
    ScriptXmlService,
    SettingsPort,
    TMP_SCRIPTING_SEGMENT,
} from "@miragon/bpmn-modeler-core";
import { NotifierPort } from "@miragon/bpmn-modeler-core";
import { canonicalPath } from "../../../shared/domain/canonicalPath";
import { toUri } from "../../../shared/adapter/out/uriPath";

/** Only a file below a `tmp/scripting` folder can be a script tab; the core decides which is. */
function mayBeScriptTab(uri: Uri): boolean {
    return uri.scheme === "file" && uri.path.includes(`/${TMP_SCRIPTING_SEGMENT}/`);
}

/** A `WorkspaceEdit` replacing the whole of `doc` with `content`. */
function fullReplaceEdit(uri: Uri, doc: TextDocument, content: string): WorkspaceEdit {
    const edit = new WorkspaceEdit();
    edit.replace(uri, new Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), content);
    return edit;
}

/**
 * VS Code's script tabs behind the core's `ScriptEditorPort`: on-disk script
 * documents for BPMN script tasks and listener scripts. Which scripts have a
 * tab is the core `ScriptTabService`'s; each tab is tracked under the
 * canonical path of its file.
 *
 * Materialises inline scripts as real files in the editor's script folder,
 * which {@link ScriptFileStore} resolves.
 * Real files (rather than a virtual filesystem) are what lets external tooling
 * participate: tsserver and language-server extensions hard-code `scheme: "file"`
 * selectors, and coding agents can only read/write bytes that exist on disk.
 *
 * A file can enter live sync two ways: {@link openTab} writes it and opens a
 * tab in one step (the panel-field button), while {@link adoptTab} starts sync
 * for a file opened any other way (Explorer, Quick Open, or the "Generate
 * Script Files" command's output). Three surfaces are supported:
 *
 * 1. `bpmn:ScriptTask` — `script` direct property.
 * 2. `camunda:ExecutionListener` — nested `script` element on any flow node.
 * 3. `camunda:TaskListener` — nested `script` element on a `bpmn:UserTask`.
 *
 * Each kind is routed to a distinct path segment so multiple scripts on the
 * same element coexist; the slug is also what {@link ScriptCompletionProvider}
 * parses to decide which Camunda beans (`execution`, `task`, `eventName`) are
 * in scope for completions.
 *
 * The open buffer — not the file on disk — is the authoritative copy: edits
 * stream into the BPMN model per keystroke, while disk freshness follows the
 * user's own save/auto-save behaviour. The one exception is a *model-side*
 * change (canvas undo/redo, external document reload) delivered through
 * {@link updateTabContent}, which overwrites the buffer.
 */
export class ScriptTaskService implements ScriptEditorPort {
    // URI paths currently being written by us — used for echo prevention.
    private readonly writingGuard = new Set<string>();

    /**
     * Reveal options for script tabs. `preview: false` pins the tab so a batch
     * open doesn't self-replace — a preview tab is reused by the next open,
     * which would arrive as a close of the earlier script and delete its
     * siblings.
     */
    private static readonly REVEAL_BESIDE = {
        viewColumn: ViewColumn.Beside,
        preserveFocus: true,
        preview: false,
    } as const;

    /**
     * Editor IDs whose diagram was discarded via "Don't Save" (or, indistinctly,
     * undone back to its saved state). Script edits buffered while the webview
     * was hidden are NOT written back for these editors — the user chose to
     * throw the diagram's changes away, and the scripts go with them.
     *
     * Tracked only for editors with a script base directory (those that opened,
     * generated or adopted a script), since that is the only case where a
     * dispose-time write-back can happen.
     */
    private readonly revertedEditors = new Set<string>();

    private listener: ScriptTabListener | undefined;

    constructor(
        private readonly scriptFiles: ScriptFileStore,
        private readonly settings: SettingsPort,
        private readonly notifier: NotifierPort,
        private readonly scriptXml: ScriptXmlService,
    ) {}

    listen(listener: ScriptTabListener): void {
        this.listener = listener;
    }

    /**
     * Registers the workspace listeners that drive the script lifecycle:
     * edits in a script tab are reported to the core, and so are opened and
     * closed tabs (the file of a closed tab stays on disk — it is deleted only
     * on element deletion or editor dispose).
     */
    register(context: ExtensionContext): void {
        context.subscriptions.push(
            workspace.onDidChangeTextDocument((event) =>
                // VS Code doesn't await this async listener, so a rejection would
                // otherwise surface as an unhandled promise rejection.
                this.onScriptDocumentChanged(event).catch((error) => {
                    this.notifier.logError(
                        error instanceof Error ? error : new Error(String(error)),
                    );
                }),
            ),
            // A Save at the close prompt is not a revert: clear any reverted mark
            // so the dispose-time script write-back stays alive for this editor.
            workspace.onDidSaveTextDocument((document) =>
                this.revertedEditors.delete(document.uri.toString()),
            ),
            window.tabGroups.onDidChangeTabs((event) => this.onTabsChanged(event)),
        );
    }

    /** The canonical path of the script's file, the spelling the tab events below report. */
    async tabPathOf(editorId: string, scriptId: string): Promise<string> {
        return canonicalPath(toUri(await this.scriptFiles.pathOf(editorId, scriptId)));
    }

    /**
     * Writes the current script content to its file in the editor's script
     * base directory and opens it beside the BPMN modeler. For JavaScript, a
     * kind-scoped `camunda.d.ts` + `jsconfig.json` are placed next to the
     * script so tsserver serves typed bean/SPIN completion.
     */
    async openTab(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        const scriptUri = await this.writeScriptFile(target, script);
        const doc = await workspace.openTextDocument(scriptUri);
        await languages.setTextDocumentLanguage(doc, target.language.languageId);
        await window.showTextDocument(doc, ScriptTaskService.REVEAL_BESIDE);
    }

    async revealTab(target: ScriptTabTarget): Promise<void> {
        const doc = await workspace.openTextDocument(toUri(target.tabPath));
        await window.showTextDocument(doc, ScriptTaskService.REVEAL_BESIDE);
    }

    /**
     * Writes an inline script to disk *without* opening a tab — the "Generate
     * Script Files" command's whole job. A failed write rejects.
     */
    async writeScript(target: ScriptTabTarget, script: InlineScript): Promise<void> {
        await this.writeScriptFile(target, script);
    }

    private async writeScriptFile(target: ScriptTabTarget, script: InlineScript): Promise<Uri> {
        const filePath = await this.scriptFiles.prepareScriptFile(target.editorId, target.uri);
        const scriptUri = toUri(filePath);
        await this.writeScriptToDisk(scriptUri, script.content, target.language, script.kind);
        return scriptUri;
    }

    /**
     * Writes a script file (and, for JavaScript, its ambient files) under the
     * echo-prevention {@link writingGuard}.
     */
    private async writeScriptToDisk(
        scriptUri: Uri,
        content: string,
        lang: ScriptLanguage,
        kind: ScriptKind,
    ): Promise<void> {
        await this.withWritingGuard(scriptUri.path, async () => {
            await this.scriptFiles.writeFile(canonicalPath(scriptUri), content);
            if (lang.languageId === "javascript") {
                await this.writeJsAmbientFiles(canonicalPath(scriptUri), kind);
            }
        });
    }

    /**
     * Runs `write` with `path` held in the echo-prevention {@link writingGuard}.
     * `onDidChangeTextDocument` fires while the write is still in flight, so
     * the guard must span the whole await — releasing it any earlier would let
     * our own write stream back into the model as a keystroke.
     */
    private async withWritingGuard(path: string, write: () => Promise<void>): Promise<void> {
        this.writingGuard.add(path);
        try {
            await write();
        } finally {
            this.writingGuard.delete(path);
        }
    }

    /**
     * Sets the language of a script file the user opened outside our own open
     * flow, so highlighting and completion engage. No content is pushed
     * either way: the file on disk becomes the source of truth on the first
     * edit after opening, which streams the whole buffer. A missing language
     * contribution must not stop the sync the core already started.
     */
    async adoptTab(tabPath: string, file: MatchedScriptFile): Promise<void> {
        try {
            const doc = await workspace.openTextDocument(toUri(tabPath));
            await languages.setTextDocumentLanguage(doc, file.language.languageId);
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    /**
     * Places `camunda.d.ts` + `jsconfig.json` next to a JavaScript script.
     * tsserver's inferred project for a loose file ignores sibling d.ts
     * files; the jsconfig makes it build a configured project over the slug
     * directory (and shields the script from any workspace-root tsconfig).
     */
    private async writeJsAmbientFiles(scriptPath: string, kind: ScriptKind): Promise<void> {
        const dir = posix.dirname(scriptPath);
        const dts = generateCamundaDts(kind, this.settings.getScriptingSpin());
        await this.scriptFiles.writeFile(joinWorkspacePath(dir, "camunda.d.ts"), dts);
        await this.scriptFiles.writeFile(joinWorkspacePath(dir, "jsconfig.json"), SCRIPT_JSCONFIG);
    }

    /**
     * Applies a *model-originated* content change (canvas undo/redo, external
     * document reload) to the open script tab. The whole buffer is
     * overwritten — the user asked for the undo, so the model side wins over
     * whatever the tab held; no merge is attempted by design.
     */
    async updateTabContent(tabPath: string, content: string): Promise<void> {
        const uri = toUri(tabPath);
        const doc = this.findOpenTextDocument(uri);
        if (!doc) {
            // Tab open but document not yet materialised (or already
            // disposed): the file is the only copy to refresh.
            await this.withWritingGuard(uri.path, () =>
                this.scriptFiles.writeFile(canonicalPath(uri), content),
            );
            return;
        }
        if (doc.getText() === content) {
            return;
        }

        await this.withWritingGuard(uri.path, async () => {
            await workspace.applyEdit(fullReplaceEdit(uri, doc, content));
        });
    }

    /**
     * The script surface is gone: saves before closing to suppress the dirty
     * prompt (the bytes are already gone from the model), then deletes the file.
     */
    async closeTab(tabPath: string): Promise<void> {
        const uri = toUri(tabPath);
        await this.saveIfDirty(uri);
        await this.closeTabsFor(new Set([uri.path]));
        void this.scriptFiles.deleteScript(canonicalPath(uri));
    }

    updateTabVariables(): void {
        // Completion reads the variable store on every request; no tab holds a copy.
    }

    async readTabContent(tabPath: string): Promise<string | undefined> {
        return this.readBufferOrDisk(toUri(tabPath));
    }

    isTabShown(tabPath: string): boolean {
        return this.isUriOpenInAnyTab(toUri(tabPath));
    }

    /**
     * Closes the script tabs of a disposed BPMN editor and deletes the
     * editor's script directory. The save/close/delete tail is
     * fire-and-forget because the participant's dispose path is synchronous;
     * the core forgot the tabs first, so their close events are no-ops.
     */
    closeEditorTabs(editorId: string, tabs: ReadonlyArray<readonly [string, OpenScriptTab]>): void {
        // Read the revert mark before clearing it: a diagram discarded via
        // "Don't Save" must not have its buffered script edits written back.
        const wasReverted = this.revertedEditors.has(editorId);
        this.revertedEditors.delete(editorId);

        const editorScriptDir = this.scriptFiles.releaseEditor(editorId);

        void (async () => {
            // Unless the diagram was discarded, write buffered script content
            // straight into the `.bpmn` XML before the files are deleted —
            // otherwise a close of a hidden diagram silently drops edits that
            // never reached the webview model. Run always (compare-and-write is
            // a no-op when nothing diverged); this also covers the debounce
            // window where the last keystroke hadn't streamed yet.
            if (!wasReverted) {
                const updates = await this.collectScriptUpdates(tabs);
                await this.persistScriptsToDocument(editorId, updates);
            }
            const uris = tabs.map(([tabPath]) => toUri(tabPath));
            for (const uri of uris) {
                await this.saveIfDirty(uri);
            }
            await this.closeTabsFor(new Set(uris.map((uri) => uri.path)));
            if (editorScriptDir !== undefined) {
                await this.scriptFiles.deleteFolder(editorScriptDir);
            }
        })().catch((error) => this.notifier.logError(error as Error));
    }

    /**
     * Collects the current content of each orphaned script as a
     * {@link ScriptContentUpdate}. A script whose content can no longer be read
     * is skipped.
     */
    private async collectScriptUpdates(
        tabs: ReadonlyArray<readonly [string, OpenScriptTab]>,
    ): Promise<ScriptContentUpdate[]> {
        const updates: ScriptContentUpdate[] = [];
        for (const [tabPath, { elementId, kind, listenerIndex }] of tabs) {
            const content = await this.readBufferOrDisk(toUri(tabPath));
            if (content === undefined) {
                continue;
            }
            updates.push({ elementId, kind, listenerIndex, content });
        }
        return updates;
    }

    /**
     * A script's current content: the open buffer when one exists (it is
     * authoritative — disk only trails it by the user's save cadence), falling
     * back to the file for the closed-while-hidden case where the buffer is
     * already gone. `undefined` when neither can be read.
     */
    private async readBufferOrDisk(uri: Uri): Promise<string | undefined> {
        const buffered = this.findOpenTextDocument(uri)?.getText();
        if (buffered !== undefined) {
            return buffered;
        }
        try {
            return await this.scriptFiles.readFile(canonicalPath(uri));
        } catch {
            return undefined;
        }
    }

    /**
     * Writes buffered script content straight into the `.bpmn` XML on the host —
     * the last-resort path when the diagram tab is closed before a hidden edit
     * could stream into the webview model. Never throws: the file deletion in
     * the dispose tail must still run even if this write-back fails.
     *
     * Echo-safe by construction: the session's own listeners are disposed by
     * the time dispose runs, and this service's doc-change listener ignores the
     * `.bpmn` (it is no script tab, and the sync head released the editor's
     * base directory so it can't read as a revert either). The
     * `WorkspaceEdit` is followed by an explicit save because no editor remains
     * to own the resulting dirty buffer.
     */
    private async persistScriptsToDocument(
        editorId: string,
        updates: ScriptContentUpdate[],
    ): Promise<void> {
        if (updates.length === 0) {
            return;
        }
        try {
            const uri = toUri(editorId);
            const doc = this.findOpenTextDocument(uri) ?? (await workspace.openTextDocument(uri));
            const nextXml = await this.scriptXml.applyScriptContents(doc.getText(), updates);
            if (nextXml === undefined) {
                // Nothing diverged from what already reached the model — no write.
                return;
            }
            await workspace.applyEdit(fullReplaceEdit(uri, doc, nextXml));
            await doc.save();
        } catch (error) {
            this.notifier.logError(error as Error);
        }
    }

    /**
     * Tab events are used instead of `workspace.onDidCloseTextDocument`
     * because the latter fires only when VS Code actually disposes the
     * `TextDocument` — disposal is debounced so the doc lingers in an
     * internal cache after the tab closes (so quick reopens are cheap).
     * While the doc lingers, the core would keep the stale tab and the next
     * open of the same script would reveal the cached doc with outdated
     * content (e.g. switching language groovy → js → groovy and reopening).
     */
    private onTabsChanged(event: TabChangeEvent): void {
        // A script file opened outside our own flow (Explorer, Quick Open, the
        // panel button) starts live sync from now on; the core tracks our own
        // opens before revealing them, so it adopts no own tab.
        for (const tab of event.opened) {
            if (tab.input instanceof TabInputText && mayBeScriptTab(tab.input.uri)) {
                void this.listener
                    ?.didOpenFile(canonicalPath(tab.input.uri))
                    .catch((error) => this.notifier.logError(error as Error));
            }
        }
        for (const tab of event.closed) {
            if (tab.input instanceof TabInputText && mayBeScriptTab(tab.input.uri)) {
                // The core flushes the pending keystroke before releasing the
                // tab; fire-and-forget with its own error sink since the tab
                // handler can't be awaited.
                void this.reportClosedScript(tab.input.uri).catch((error) =>
                    this.notifier.logError(error as Error),
                );
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

    private findOpenTextDocument(uri: Uri): TextDocument | undefined {
        // Guard the scheme: a `git:` diff view of the same path would otherwise
        // match, and a dispose-time write-back against it reads HEAD content
        // (wrong range) then throws on `save()` (the doc is readonly). Aligns
        // with `EditorSessionStore.findEditorIdByPath`.
        return workspace.textDocuments.find(
            (doc) => doc.uri.path === uri.path && doc.uri.scheme === "file",
        );
    }

    /**
     * Saves the document backing `uri` if it is open and dirty, so a
     * programmatic tab close doesn't pop VS Code's "do you want to save"
     * prompt. Saving is always safe: the buffer's bytes already streamed
     * into the BPMN model, and the file is transient anyway.
     */
    private async saveIfDirty(uri: Uri): Promise<void> {
        const doc = this.findOpenTextDocument(uri);
        if (doc?.isDirty) {
            try {
                await doc.save();
            } catch (error) {
                this.notifier.logError(error as Error);
            }
        }
    }

    private async closeTabsFor(paths: Set<string>): Promise<void> {
        for (const group of window.tabGroups.all) {
            for (const tab of group.tabs) {
                if (
                    tab.input instanceof TabInputText &&
                    tab.input.uri.scheme === "file" &&
                    paths.has(tab.input.uri.path)
                ) {
                    try {
                        await window.tabGroups.close(tab);
                    } catch (error) {
                        this.notifier.logError(error as Error);
                    }
                }
            }
        }
    }

    private async reportClosedScript(uri: Uri): Promise<void> {
        /**
         * Tab moves between groups arrive as a close + open pair for the
         * same URI; if the URI is still open in another tab, this was a
         * move and the script's tab must stay alive for keystroke tracking.
         */
        if (this.isUriOpenInAnyTab(uri)) {
            return;
        }
        await this.listener?.didClose(canonicalPath(uri));
    }

    private async onScriptDocumentChanged(event: TextDocumentChangeEvent): Promise<void> {
        const uri = event.document.uri;

        if (uri.scheme !== "file") {
            return;
        }
        if (event.contentChanges.length === 0) {
            return;
        }

        // A change on a tracked *diagram* (not a script file) is the
        // revert-detection signal for the "Don't Save" write-back suppression.
        if (this.scriptFiles.hasBaseDir(uri.toString())) {
            this.trackDiagramRevert(event.document);
            return;
        }

        if (this.writingGuard.has(uri.path) || !mayBeScriptTab(uri)) {
            return;
        }

        // Note this also fires when the buffer reloads after an *external*
        // write (a coding agent editing the file on disk): VS Code refreshes
        // non-dirty buffers automatically, so agent edits stream into the
        // model through the same path as keystrokes.
        this.listener?.didChange(canonicalPath(uri), event.document.getText());
    }

    /**
     * Maintains {@link revertedEditors} for the diagram backing `document`.
     *
     * VS Code fires a "Don't Save"/revert as a content change on an
     * already-clean document, so a change with `isDirty === false` is the
     * revert signal; a dirty change means the user is still editing (unmark).
     * Accepted limitation: an "undo back to the last saved state" also lands as
     * a clean change and is therefore indistinguishable from a revert — it too
     * suppresses the dispose-time script write-back.
     */
    private trackDiagramRevert(document: TextDocument): void {
        const editorId = document.uri.toString();
        if (document.isDirty) {
            this.revertedEditors.delete(editorId);
        } else {
            this.revertedEditors.add(editorId);
        }
    }
}
