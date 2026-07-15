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

import {
    AsyncDebounced,
    asyncDebounce,
    OpenScriptEditorRef,
    ScriptKind,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
} from "@miragon/bpmn-modeler-shared";

import {
    EditorSessionStore,
    generateCamundaDts,
    isHiddenEditorError,
    matchScriptFile,
    SCRIPT_JSCONFIG,
    ScriptContentUpdate,
    ScriptLanguage,
    ScriptUri,
    ScriptXmlService,
    SettingsPort,
} from "@miragon/bpmn-modeler-core";
import { ScriptFileStore } from "../infrastructure/ScriptFileStore";
import { toUri } from "../../shared/infrastructure/uriPath";
import { VsCodeNotifier } from "../../shared/infrastructure/VsCodeNotifier";
import { VsCodePicker } from "../../shared/infrastructure/VsCodePicker";

/**
 * Tracks an open script document.
 */
interface OpenDocument {
    readonly editorId: string;
    readonly elementId: string;
    readonly kind: ScriptKind;
    readonly listenerIndex: number | undefined;
    readonly uri: Uri;
}

/**
 * Outcome of {@link ScriptTaskService.materializeScript}. `written` is false
 * when an open tab already owned the script and its buffer was left untouched —
 * the completion notification uses it to report the skipped-already-open count.
 */
export interface MaterializeScriptResult {
    readonly path: string;
    readonly written: boolean;
}

/** A `WorkspaceEdit` replacing the whole of `doc` with `content`. */
function fullReplaceEdit(uri: Uri, doc: TextDocument, content: string): WorkspaceEdit {
    const edit = new WorkspaceEdit();
    edit.replace(uri, new Range(doc.positionAt(0), doc.positionAt(doc.getText().length)), content);
    return edit;
}

/**
 * Manages on-disk script documents for BPMN script tasks and listener scripts.
 *
 * Materialises inline scripts as real files under `<configFolder>/tmp/scripting/`.
 * Real files (rather than a virtual filesystem) are what lets external tooling
 * participate: tsserver and language-server extensions hard-code `scheme: "file"`
 * selectors, and coding agents can only read/write bytes that exist on disk.
 *
 * A file can enter live sync two ways: {@link openScriptEditor} writes it and
 * opens a tab in one step (the panel-field button), while
 * {@link adoptExternallyOpenedScript} starts sync for a file opened any other way
 * (Explorer, Quick Open, or the "Generate Script Files" command's output). Three
 * surfaces are supported:
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
 * stream into the BPMN model per keystroke via {@link UpdateScriptContentQuery},
 * while disk freshness follows the user's own save/auto-save behaviour. The
 * one exception is a *model-side* change (canvas undo/redo, external document
 * reload) delivered through {@link applyModelChange}, which overwrites the
 * buffer.
 */
export class ScriptTaskService {
    // Open script documents keyed by canonical `uri.path`.
    private readonly openDocuments = new Map<string, OpenDocument>();

    // URI paths currently being written by us — used for echo prevention.
    private readonly writingGuard = new Set<string>();

    /**
     * Resolved `<…>/tmp/scripting` base directory per BPMN editor. Cached at
     * first open both to avoid re-resolving per script and to keep teardown
     * deterministic: the dispose sweep must delete from the directory the
     * files were actually written to, even if the configFolder setting
     * changed while the editor was open.
     */
    private readonly baseDirByEditor = new Map<string, string>();

    /**
     * Editor IDs whose webview was hidden when a script change occurred.
     *
     * VS Code hides a webview when its editor tab is not visible (e.g. the
     * user has switched to another tab); `editorStore.postMessage` then
     * throws "The active editor is hidden." — we'd silently drop the edit
     * if we just logged that error. Instead we mark the editor here and
     * replay all open script documents the next time the webview comes
     * back (signalled by it sending `GetBpmnModelerSettingCommand` after a
     * reload, which the controller forwards to {@link resyncOpenDocuments}).
     */
    private readonly pendingResync = new Set<string>();

    /** How long keystrokes coalesce before one streams into the webview model. */
    private static readonly STREAM_DEBOUNCE_MS = 300;

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
     * One debounced content sender per open script `uri.path`. Each keystroke
     * re-arms the trailing edge, so a burst of typing produces a single
     * `UpdateScriptContentQuery` (with a full diagram XML export behind it)
     * instead of one per character. The sender body owns the hidden-webview
     * catch and error logging, so it never rejects.
     */
    private readonly contentSenders = new Map<
        string,
        AsyncDebounced<(content: string) => Promise<void>>
    >();

    /**
     * Editor IDs whose diagram was discarded via "Don't Save" (or, indistinctly,
     * undone back to its saved state). Script edits buffered while the webview
     * was hidden are NOT written back for these editors — the user chose to
     * throw the diagram's changes away, and the scripts go with them.
     *
     * Tracked only for editors present in {@link baseDirByEditor} (i.e. those
     * that opened at least one script), since that is the only case where a
     * dispose-time write-back can happen.
     */
    private readonly revertedEditors = new Set<string>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly scriptFiles: ScriptFileStore,
        private readonly settings: SettingsPort,
        private readonly notifier: VsCodeNotifier,
        private readonly picker: VsCodePicker,
        private readonly scriptXml: ScriptXmlService,
    ) {}

    /**
     * Registers the workspace listeners that drive the script lifecycle:
     * edits in a script tab are propagated back to the BPMN modeler, and tab
     * closures release tracking state (the file stays on disk — it is deleted
     * only on element deletion or editor dispose) so a re-open rewrites the
     * current BPMN content over it.
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

    /**
     * Opens an inline script in a VS Code editor tab.
     *
     * Writes the current script content to its file under the editor's
     * `tmp/scripting` base directory and opens it beside the BPMN modeler.
     * For JavaScript, a kind-scoped `camunda.d.ts` + `jsconfig.json` are
     * placed next to the script so tsserver serves typed bean/SPIN completion.
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
        const target = await this.resolveScriptTarget(
            editorId,
            elementId,
            kind,
            listenerIndex,
            eventName,
            scriptFormat,
        );
        if (!target) {
            return; // language picker cancelled
        }
        const { scriptUri, lang, baseDir } = target;

        /**
         * Already open: just reveal the existing editor.
         */
        if (this.openDocuments.has(scriptUri.path)) {
            const doc = await workspace.openTextDocument(scriptUri);
            await window.showTextDocument(doc, ScriptTaskService.REVEAL_BESIDE);
            return;
        }

        await this.writeScriptToDisk(scriptUri, baseDir, content, lang, kind);

        const doc = await workspace.openTextDocument(scriptUri);
        await languages.setTextDocumentLanguage(doc, lang.languageId);

        // Track before revealing: showTextDocument fires an opened-tab event
        // that the adoption listener reacts to. Its own-open guard keys off
        // openDocuments, so setting the entry first is what stops us from
        // re-adopting (and re-broadcasting) our own open.
        this.openDocuments.set(scriptUri.path, {
            editorId,
            elementId,
            kind,
            listenerIndex,
            uri: scriptUri,
        });

        await window.showTextDocument(doc, ScriptTaskService.REVEAL_BESIDE);

        // Tell the webview a tab now owns this script so the panel field locks.
        this.broadcastOpenScripts(editorId);
    }

    /**
     * Writes an inline script to disk *without* opening a tab, tracking it, or
     * locking the panel — the "Generate Script Files" command's whole job.
     * Returns the file path and whether it was written; `undefined` when the
     * language picker was cancelled. Live sync starts only once the user opens
     * the file (adoption), so a generated-but-unopened file stays a plain file.
     *
     * A script already owned by an open tab is left untouched (`written:false`):
     * that tab's buffer is the authoritative copy, so overwriting it from the
     * model would clobber unsaved edits.
     */
    async materializeScript(
        editorId: string,
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        eventName: string | undefined,
        scriptFormat: string,
        content: string,
    ): Promise<MaterializeScriptResult | undefined> {
        const target = await this.resolveScriptTarget(
            editorId,
            elementId,
            kind,
            listenerIndex,
            eventName,
            scriptFormat,
        );
        if (!target) {
            return undefined; // language picker cancelled
        }

        if (this.openDocuments.has(target.scriptUri.path)) {
            return { path: target.scriptUri.path, written: false };
        }

        await this.writeScriptToDisk(target.scriptUri, target.baseDir, content, target.lang, kind);
        return { path: target.scriptUri.path, written: true };
    }

    /**
     * Resolves the on-disk target for a script: prompts for a language when the
     * model's `scriptFormat` is missing or unsupported (persisting the pick so
     * the next open skips the prompt), builds the {@link ScriptUri}, and joins it
     * onto the editor's cached base directory. `undefined` when the picker is
     * cancelled. Shared by {@link openScriptEditor} and {@link materializeScript}
     * so both resolve — and cache `baseDirByEditor` — identically; that cache
     * population is what lets {@link disposeForEditor} later delete the files.
     */
    private async resolveScriptTarget(
        editorId: string,
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        eventName: string | undefined,
        scriptFormat: string,
    ): Promise<{ scriptUri: Uri; lang: ScriptLanguage; baseDir: string } | undefined> {
        let effectiveFormat = scriptFormat;
        if (!ScriptLanguage.isSupported(scriptFormat)) {
            const picked = await this.picker.pickScriptLanguage(scriptFormat);
            if (!picked) {
                return undefined;
            }
            effectiveFormat = picked;
            await this.sendFormatUpdate(editorId, elementId, kind, listenerIndex, picked);
        }

        const lang = new ScriptLanguage(effectiveFormat);
        const script = new ScriptUri(
            editorId,
            elementId,
            kind,
            listenerIndex,
            eventName,
            lang.extension,
        );
        const baseDir = await this.scriptsBaseDir(editorId);
        const scriptUri = toUri(posix.join(baseDir, script.relativePath()));
        return { scriptUri, lang, baseDir };
    }

    /**
     * Resolves (and caches) the editor's `<…>/tmp/scripting` base directory.
     * Public so the message handler can name the folder in its completion
     * notification and the adoption listener can containment-check opened files
     * against it. Caching keeps teardown deterministic — see
     * {@link baseDirByEditor}.
     */
    async scriptsBaseDir(editorId: string): Promise<string> {
        let baseDir = this.baseDirByEditor.get(editorId);
        if (baseDir === undefined) {
            baseDir = await this.scriptFiles.resolveBaseDir(editorId);
            this.baseDirByEditor.set(editorId, baseDir);
        }
        return baseDir;
    }

    /**
     * Writes a script file (and, for JavaScript, its ambient files) under the
     * echo-prevention {@link writingGuard}. The `.gitignore` is best-effort: a
     * failure to write it must not block materialising the script itself.
     */
    private async writeScriptToDisk(
        scriptUri: Uri,
        baseDir: string,
        content: string,
        lang: ScriptLanguage,
        kind: ScriptKind,
    ): Promise<void> {
        try {
            await this.scriptFiles.ensureGitignore(baseDir);
        } catch (error) {
            this.notifier.logError(error as Error);
        }

        await this.withWritingGuard(scriptUri.path, async () => {
            await this.scriptFiles.writeFile(scriptUri.path, content);
            if (lang.languageId === "javascript") {
                await this.writeJsAmbientFiles(scriptUri.path, kind);
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
     * Adopts a script file opened *outside* our own open flow — via Explorer,
     * Quick Open, or the properties-panel button on an untracked file — so live
     * sync into the BPMN model starts from that moment. Without adoption,
     * keystrokes would be silently dropped: {@link onScriptDocumentChanged}
     * filters strictly by {@link openDocuments}, so an untracked path never
     * streams.
     *
     * Adoption is track + set-language + lock only: no content is pushed either
     * way. The file on disk becomes the source of truth on the first edit after
     * opening (keystroke streaming sends the whole buffer), so a file that went
     * stale between materialise and open catches the model up on the first edit.
     */
    private async adoptExternallyOpenedScript(uri: Uri): Promise<void> {
        // Our own opens set openDocuments *before* showTextDocument, so a
        // tracked path here is our own tab — nothing to adopt.
        if (this.openDocuments.has(uri.path)) {
            return;
        }

        const match = matchScriptFile(uri.path, this.editorStore.getEditorIds());
        if (!match) {
            return;
        }

        // The tmp/scripting marker alone is a heuristic any same-named user
        // directory satisfies; the resolved base dir is the exact containment.
        const baseDir = await this.scriptsBaseDir(match.editorId);
        if (!uri.path.startsWith(`${baseDir}/`)) {
            return;
        }

        // Re-check after the awaits: our own open of the same path could have
        // raced in and tracked it already.
        if (this.openDocuments.has(uri.path)) {
            return;
        }

        this.openDocuments.set(uri.path, {
            editorId: match.editorId,
            elementId: match.elementId,
            kind: match.kind,
            listenerIndex: match.listenerIndex,
            uri,
        });

        // Set the language so highlighting/completion engage. A missing language
        // contribution must not abort adoption — the tracking above is what makes
        // keystroke sync work, and it is already in place.
        try {
            const doc = await workspace.openTextDocument(uri);
            await languages.setTextDocumentLanguage(doc, match.language.languageId);
        } catch (error) {
            this.notifier.logError(error as Error);
        }

        this.broadcastOpenScripts(match.editorId);
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
        await this.scriptFiles.writeFile(posix.join(dir, "camunda.d.ts"), dts);
        await this.scriptFiles.writeFile(posix.join(dir, "jsconfig.json"), SCRIPT_JSCONFIG);
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
                if (isHiddenEditorError(error)) {
                    return;
                }
                this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            });
    }

    /**
     * Maps an open script URI path back to its owning BPMN editor id, or
     * `undefined` if no script is tracked at that path. Doubles as the "is
     * this one of ours" guard for the completion provider and code action —
     * their `tmp/scripting` glob selector is a heuristic that any same-named
     * user directory could satisfy, whereas this map is exact.
     */
    getEditorIdForScriptUri(uriPath: string): string | undefined {
        return this.openDocuments.get(uriPath)?.editorId;
    }

    /**
     * Applies a *model-originated* content change (canvas undo/redo, external
     * document reload, element deletion) to the open script tab.
     *
     * `content === undefined` means the element or its script no longer
     * exists: the tab is closed and its file deleted. Otherwise the whole
     * buffer is overwritten — the user asked for the undo, so the model side
     * wins over whatever the tab held; no merge is attempted by design.
     */
    async applyModelChange(
        editorId: string,
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
        content: string | undefined,
    ): Promise<void> {
        const entry = this.findOpenDocument(editorId, elementId, kind, listenerIndex);
        if (!entry) {
            return;
        }

        if (content === undefined) {
            // The script surface is gone: drop the sender entirely so a pending
            // keystroke can't fire against a deleted element. Clear tracking
            // first so the tab-close event is a no-op, then save-before-close to
            // suppress the dirty prompt (the bytes are already gone from the
            // model; the file is deleted right after).
            this.dropSender(entry.uri.path);
            this.openDocuments.delete(entry.uri.path);
            this.broadcastOpenScripts(editorId);
            await this.saveIfDirty(entry.uri);
            await this.closeTabsFor(new Set([entry.uri.path]));
            void this.deleteScriptDir(entry.uri);
            return;
        }

        // Canvas undo/redo (or a document reload) overwrites the buffer; cancel
        // any pending keystroke so it can't fire afterwards and clobber the
        // model-side content the user actually asked for.
        this.contentSenders.get(entry.uri.path)?.cancel();

        const doc = this.findOpenTextDocument(entry.uri);
        if (!doc) {
            // Tab open but document not yet materialised (or already
            // disposed): the file is the only copy to refresh.
            await this.withWritingGuard(entry.uri.path, () =>
                this.scriptFiles.writeFile(entry.uri.path, content),
            );
            return;
        }
        if (doc.getText() === content) {
            return;
        }

        await this.withWritingGuard(entry.uri.path, async () => {
            await workspace.applyEdit(fullReplaceEdit(entry.uri, doc, content));
        });
    }

    /**
     * Re-sends the current content of every open script document for the
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
            const content = await this.readBufferOrDisk(entry);
            if (content === undefined) {
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
                // The replay just carried the live buffer, so any keystroke
                // still pending in this path's sender is redundant — cancel it
                // to avoid a duplicate post landing right after.
                this.contentSenders.get(entry.uri.path)?.cancel();
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
                if (isHiddenEditorError(error)) {
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
     * Cleans up all script documents associated with a BPMN editor: closes
     * any orphaned script tabs and deletes the editor's script directory.
     *
     * Called when the BPMN editor panel is disposed. Internal state is
     * cleared synchronously before tabs are closed so the {@link onTabsChanged}
     * handler is a no-op for these URIs; the save/close/delete tail is
     * fire-and-forget because the participant's dispose path is synchronous.
     */
    disposeForEditor(editorId: string): void {
        // Keep the full entries (not just URIs): the dispose-time write-back
        // needs each script's elementId/kind/listenerIndex to address the XML.
        const orphaned = new Map<string, OpenDocument>();
        for (const [path, entry] of this.openDocuments) {
            if (entry.editorId === editorId) {
                orphaned.set(path, entry);
            }
        }
        for (const path of orphaned.keys()) {
            this.openDocuments.delete(path);
            // The handle is already gone (dispose ordering), so a pending
            // keystroke can never reach the webview. Cancel it — never flush;
            // any divergence is covered by the compare-and-write below.
            this.dropSender(path);
        }

        this.pendingResync.delete(editorId);

        // Read the revert mark before clearing it: a diagram discarded via
        // "Don't Save" must not have its buffered script edits written back.
        const wasReverted = this.revertedEditors.has(editorId);
        this.revertedEditors.delete(editorId);

        const baseDir = this.baseDirByEditor.get(editorId);
        this.baseDirByEditor.delete(editorId);

        void (async () => {
            // Unless the diagram was discarded, write buffered script content
            // straight into the `.bpmn` XML before the files are deleted —
            // otherwise a close of a hidden diagram silently drops edits that
            // never reached the webview model. Run always (compare-and-write is
            // a no-op when nothing diverged); this also covers the sub-300 ms
            // debounce window where the last keystroke hadn't streamed yet.
            if (!wasReverted) {
                const updates = await this.collectScriptUpdates(orphaned);
                await this.persistScriptsToDocument(editorId, updates);
            }
            for (const entry of orphaned.values()) {
                await this.saveIfDirty(entry.uri);
            }
            await this.closeTabsFor(new Set(orphaned.keys()));
            if (baseDir !== undefined) {
                await this.scriptFiles.deleteDir(
                    posix.join(baseDir, ScriptUri.hashEditorId(editorId)),
                );
            }
        })().catch((error) => this.notifier.logError(error as Error));
    }

    /**
     * Collects the current content of each orphaned script as a
     * {@link ScriptContentUpdate}. A script whose content can no longer be read
     * is skipped.
     */
    private async collectScriptUpdates(
        orphaned: Map<string, OpenDocument>,
    ): Promise<ScriptContentUpdate[]> {
        const updates: ScriptContentUpdate[] = [];
        for (const entry of orphaned.values()) {
            const content = await this.readBufferOrDisk(entry);
            if (content === undefined) {
                continue;
            }
            updates.push({
                elementId: entry.elementId,
                kind: entry.kind,
                listenerIndex: entry.listenerIndex,
                content,
            });
        }
        return updates;
    }

    /**
     * A script's current content: the open buffer when one exists (it is
     * authoritative — disk only trails it by the user's save cadence), falling
     * back to the file for the closed-while-hidden case where the buffer is
     * already gone. `undefined` when neither can be read.
     */
    private async readBufferOrDisk(entry: OpenDocument): Promise<string | undefined> {
        const buffered = this.findOpenTextDocument(entry.uri)?.getText();
        if (buffered !== undefined) {
            return buffered;
        }
        try {
            return await this.scriptFiles.readFile(entry.uri.path);
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
     * `.bpmn` (it isn't in {@link openDocuments}, and the editor was removed
     * from {@link baseDirByEditor} in the sync head so it can't read as a
     * revert either). The `WorkspaceEdit` is followed by an explicit save
     * because no editor remains to own the resulting dirty buffer.
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
     * While the doc lingers, our `openDocuments` map would keep the stale
     * entry and the next `openScriptEditor` call for the same URI would hit
     * the "already open" branch and reveal the cached doc with outdated
     * content (e.g. switching language groovy → js → groovy and reopening).
     *
     * Safe no-op when {@link disposeForEditor} has already removed the
     * entry — it clears state before programmatically closing tabs.
     */
    private onTabsChanged(event: TabChangeEvent): void {
        // Adoption: a script file opened outside our own flow (Explorer, Quick
        // Open, the panel button) starts live sync from now on. The listener
        // itself decides what's a script; own opens are guarded by openDocuments.
        for (const tab of event.opened) {
            if (tab.input instanceof TabInputText && tab.input.uri.scheme === "file") {
                void this.adoptExternallyOpenedScript(tab.input.uri).catch((error) =>
                    this.notifier.logError(error as Error),
                );
            }
        }
        for (const tab of event.closed) {
            if (tab.input instanceof TabInputText && this.openDocuments.has(tab.input.uri.path)) {
                // Cleanup is async (it flushes the pending keystroke before
                // releasing tracking); fire-and-forget with its own error sink
                // since the tab handler can't be awaited.
                void this.cleanupClosedScript(tab.input.uri).catch((error) =>
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
        return workspace.textDocuments.find((doc) => doc.uri.path === uri.path);
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

    private async cleanupClosedScript(uri: Uri): Promise<void> {
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

        // The last <300 ms of typing is still sitting in the debounced sender;
        // force it into the model before dropping tracking. A flush against a
        // hidden webview arms `pendingResync` *asynchronously*, so the
        // pendingResync re-check below MUST run after the await — a pre-await
        // check would race past it and drop the still-unreplayed buffer.
        await this.contentSenders.get(uri.path)?.flush();

        /**
         * Real close, but the BPMN webview was hidden when the user typed
         * — `pendingResync` carries the buffered edit, and the buffer (or
         * its last save) is the only copy. Defer cleanup until the resync
         * runs so it can replay before we forget the entry.
         */
        if (this.pendingResync.has(entry.editorId)) {
            return;
        }

        this.performCleanup(uri);
    }

    /**
     * Releases tracking for a closed script tab without touching the file on
     * disk. The file survives a tab close on purpose: reopening the same script
     * must succeed, and its content is refreshed from the current model on
     * reopen ({@link openScriptEditor} rewrites through the rewrite branch once
     * the path is gone from {@link openDocuments}). Deletion happens only on
     * element deletion, editor dispose, and the activation orphan sweep.
     */
    private performCleanup(uri: Uri): void {
        // Capture the owning editor before removing so the lock broadcast below
        // reflects the removal — the entry is gone by the time we post.
        const editorId = this.openDocuments.get(uri.path)?.editorId;
        this.openDocuments.delete(uri.path);
        this.dropSender(uri.path);

        if (editorId !== undefined) {
            this.broadcastOpenScripts(editorId);
        }
    }

    /**
     * Deletes the script's slug directory — the file itself plus, for
     * JavaScript, its `camunda.d.ts` and `jsconfig.json` siblings. Called only
     * when the script surface itself is gone (element deletion via
     * {@link applyModelChange}); a plain tab close leaves the file in place so a
     * re-open can succeed and rewrite it from the current model. Editor dispose
     * deletes the whole `<editorHash>` dir separately.
     */
    private async deleteScriptDir(uri: Uri): Promise<void> {
        const dir = posix.dirname(uri.path);
        try {
            await this.scriptFiles.deleteDir(dir);
        } catch (error) {
            this.notifier.logError(error as Error);
        }
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
        if (this.baseDirByEditor.has(uri.toString())) {
            this.trackDiagramRevert(event.document);
            return;
        }

        if (this.writingGuard.has(uri.path)) {
            return;
        }

        const entry = this.openDocuments.get(uri.path);
        if (!entry) {
            return;
        }

        // Note this also fires when the buffer reloads after an *external*
        // write (a coding agent editing the file on disk): VS Code refreshes
        // non-dirty buffers automatically, so agent edits stream into the
        // model through the same path as keystrokes.
        const updatedContent = event.document.getText();

        // Fire-and-forget through the per-path debounced sender: it self-handles
        // the hidden-webview and error cases (never rejecting), and awaiting the
        // debounced promise here would deadlock the fake-timer tests.
        void this.getSender(entry)(updatedContent);
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

    /**
     * Lazily creates (and caches) the debounced content sender for a script's
     * path. The closure captures the open-document entry — stable for the tab's
     * lifetime — and streams the latest buffer into the webview model, owning
     * the hidden-webview catch so the debounced body never rejects.
     */
    private getSender(entry: OpenDocument): AsyncDebounced<(content: string) => Promise<void>> {
        let sender = this.contentSenders.get(entry.uri.path);
        if (!sender) {
            sender = asyncDebounce(async (content: string) => {
                try {
                    await this.editorStore.postMessage(
                        entry.editorId,
                        new UpdateScriptContentQuery(
                            entry.elementId,
                            entry.kind,
                            entry.listenerIndex,
                            content,
                        ),
                    );
                } catch (error) {
                    /**
                     * VS Code throws "The active editor is hidden." when the
                     * webview's tab isn't visible. The user may still be typing,
                     * so mark the editor and replay all open documents on the
                     * next reload via `resyncOpenDocuments`.
                     */
                    if (isHiddenEditorError(error)) {
                        this.pendingResync.add(entry.editorId);
                    } else {
                        this.notifier.logError(error as Error);
                    }
                }
            }, ScriptTaskService.STREAM_DEBOUNCE_MS);
            this.contentSenders.set(entry.uri.path, sender);
        }
        return sender;
    }

    /** Cancels any pending keystroke for `path` and forgets its sender. */
    private dropSender(path: string): void {
        this.contentSenders.get(path)?.cancel();
        this.contentSenders.delete(path);
    }

    private findOpenDocument(
        editorId: string,
        elementId: string,
        kind: ScriptKind,
        listenerIndex: number | undefined,
    ): OpenDocument | undefined {
        for (const entry of this.openDocuments.values()) {
            if (
                entry.editorId === editorId &&
                entry.elementId === elementId &&
                entry.kind === kind &&
                (entry.listenerIndex ?? 0) === (listenerIndex ?? 0)
            ) {
                return entry;
            }
        }
        return undefined;
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
