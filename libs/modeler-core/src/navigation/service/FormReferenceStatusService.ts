import { FormReferenceStatusQuery } from "@miragon/bpmn-modeler-shared";

import { DocumentPort, NotifierPort, WorkspacePort } from "../../kernel/domain/hostPorts";
import { isWithinRoot } from "../../kernel/domain/rootContainment";
import { searchScopeKey, searchScopeRoots } from "../../kernel/domain/searchScope";
import { EVERY_PATH_GLOB, watchedChangeOf } from "../../kernel/domain/watchedFiles";
import { WatcherEventKind } from "../../kernel/domain/watcherEvents";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { CreatedFolderWalks } from "../../kernel/service/CreatedFolderWalks";
import { resolveSearchScope } from "../../kernel/service/workspaceFileSearch";
import { FormDeclarationsResult, ReferencedModelLocator } from "./ReferencedModelLocator";

const WATCH_DEBOUNCE_MS = 150;

const isFormFile = (path: string) => path.endsWith(".form");

interface EditorState {
    sourcePath: string;
    roots: readonly string[];
    scopeKey: string;
    token: symbol;
    lastSignature?: string;
    /** The forms the last refresh read an id from. */
    formPaths: readonly string[];
}

interface RootState {
    editors: Set<string>;
    watcher: { dispose(): void };
    createdFolders: CreatedFolderWalks;
}

/** Maintains the set of resolvable form ids for every open BPMN webview. */
export class FormReferenceStatusService {
    private readonly editors = new Map<string, EditorState>();
    private readonly roots = new Map<string, RootState>();
    private readonly refreshChains = new Map<string, Promise<void>>();
    private readonly scopeScans = new Map<string, Promise<FormDeclarationsResult>>();
    private readonly pendingRoots = new Set<string>();
    private watchTimer: ReturnType<typeof setTimeout> | undefined;
    private disposed = false;

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly document: DocumentPort,
        private readonly workspace: WorkspacePort,
        private readonly locator: ReferencedModelLocator,
        private readonly notifier: NotifierPort,
    ) {}

    async requestStatus(editorId: string): Promise<void> {
        if (this.disposed) return;
        this.watchSearchScope(editorId);
        await this.queueRefresh(editorId, true);
    }

    disposeEditor(editorId: string): void {
        const editor = this.editors.get(editorId);
        if (!editor) return;
        this.editors.delete(editorId);
        this.refreshChains.delete(editorId);

        for (const root of editor.roots) this.releaseRoot(root, editorId);

        if (![...this.editors.values()].some(({ scopeKey }) => scopeKey === editor.scopeKey)) {
            this.scopeScans.delete(editor.scopeKey);
        }
    }

    dispose(): void {
        this.disposed = true;
        if (this.watchTimer !== undefined) clearTimeout(this.watchTimer);
        this.watchTimer = undefined;
        for (const state of this.roots.values()) {
            state.watcher.dispose();
            state.createdFolders.dispose();
        }
        this.roots.clear();
        this.editors.clear();
        this.refreshChains.clear();
        this.scopeScans.clear();
        this.pendingRoots.clear();
    }

    // Workspace folders can change while an editor is open, so every request
    // watches the folders as they are now.
    private watchSearchScope(editorId: string): void {
        const editor = this.editors.get(editorId) ?? this.registerEditor(editorId);
        const scope = resolveSearchScope(this.workspace, editor.sourcePath);
        const roots = scope ? searchScopeRoots(scope) : [];
        for (const root of editor.roots) {
            if (!roots.includes(root)) this.releaseRoot(root, editorId);
        }
        for (const root of roots) {
            if (!editor.roots.includes(root)) this.acquireRoot(root, editorId);
        }
        editor.roots = roots;
        editor.scopeKey = scope ? searchScopeKey(scope) : "";
    }

    private registerEditor(editorId: string): EditorState {
        const editor: EditorState = {
            sourcePath: this.document.getFilePath(editorId),
            roots: [],
            scopeKey: "",
            token: Symbol(editorId),
            formPaths: [],
        };
        this.editors.set(editorId, editor);
        return editor;
    }

    private acquireRoot(root: string, editorId: string): void {
        const existing = this.roots.get(root);
        if (existing) {
            existing.editors.add(editorId);
            return;
        }

        const changed = (event: WatcherEventKind) => (path: string) =>
            this.onWatchedChange(root, event, path);
        try {
            const watcher = this.workspace.createWatcher(root, EVERY_PATH_GLOB, {
                onChange: changed("change"),
                onCreate: changed("create"),
                onDelete: changed("delete"),
            });
            const createdFolders = new CreatedFolderWalks(this.workspace, isFormFile, (forms) => {
                if (forms.length > 0) this.scheduleRefresh(root);
            });
            this.roots.set(root, { editors: new Set([editorId]), watcher, createdFolders });
        } catch (error) {
            this.notifier.logWarning(
                `Could not watch Camunda Forms under ${root}: ${(error as Error).message}`,
            );
        }
    }

    private releaseRoot(root: string, editorId: string): void {
        const state = this.roots.get(root);
        if (!state) return;
        state.editors.delete(editorId);
        if (state.editors.size === 0) {
            state.watcher.dispose();
            state.createdFolders.dispose();
            this.roots.delete(root);
            this.pendingRoots.delete(root);
        }
    }

    // Every refresh reads all forms, so a folder event triggers one only when
    // the folder holds forms.
    private onWatchedChange(root: string, event: WatcherEventKind, path: string): void {
        switch (watchedChangeOf(event, path, root, isFormFile)) {
            case "file":
                this.scheduleRefresh(root);
                break;
            case "folderCreated":
                void this.roots.get(root)?.createdFolders.add(path);
                break;
            case "folderDeleted":
                if (this.mayHaveReadFormsBelow(root, path)) this.scheduleRefresh(root);
                break;
        }
    }

    private mayHaveReadFormsBelow(root: string, folder: string): boolean {
        return [...(this.roots.get(root)?.editors ?? [])].some(
            (editorId) =>
                // A running refresh may hold forms its editor's paths do not list yet.
                this.refreshChains.has(editorId) ||
                this.editors.get(editorId)?.formPaths.some((path) => isWithinRoot(path, folder)),
        );
    }

    private scheduleRefresh(root: string): void {
        for (const editorId of this.roots.get(root)?.editors ?? []) {
            const editor = this.editors.get(editorId);
            if (editor) this.scopeScans.delete(editor.scopeKey);
        }
        this.pendingRoots.add(root);
        if (this.watchTimer !== undefined) clearTimeout(this.watchTimer);
        this.watchTimer = setTimeout(() => {
            this.watchTimer = undefined;
            const editorIds = new Set<string>();
            for (const pendingRoot of this.pendingRoots) {
                this.roots.get(pendingRoot)?.editors.forEach((editorId) => editorIds.add(editorId));
            }
            this.pendingRoots.clear();
            for (const editorId of editorIds) {
                void this.queueRefresh(editorId, false).catch((error) =>
                    this.notifier.logError(error as Error),
                );
            }
        }, WATCH_DEBOUNCE_MS);
    }

    private queueRefresh(editorId: string, force: boolean): Promise<void> {
        const previous = this.refreshChains.get(editorId) ?? Promise.resolve();
        const next = previous.catch(() => undefined).then(() => this.refresh(editorId, force));
        this.refreshChains.set(editorId, next);
        return next.finally(() => {
            if (this.refreshChains.get(editorId) === next) this.refreshChains.delete(editorId);
        });
    }

    private async refresh(editorId: string, force: boolean): Promise<void> {
        const editor = this.editors.get(editorId);
        if (!editor || this.disposed) return;
        const result = await this.scanScope(editor);
        if (this.editors.get(editorId)?.token !== editor.token || this.disposed) return;

        let formIds: string[] = [];
        editor.formPaths = [];
        if (result.kind === "matches") {
            result.readFailures.forEach((failure) => this.notifier.logWarning(failure));
            formIds = [...new Set(result.declarations.map(({ id }) => id))].sort();
            editor.formPaths = result.declarations.map(({ path }) => path);
        } else if (result.kind === "all-unreadable") {
            result.failures.forEach((failure) => this.notifier.logWarning(failure));
        }

        const signature = JSON.stringify(formIds);
        if (!force && signature === editor.lastSignature) return;
        editor.lastSignature = signature;
        await this.editorStore.postMessage(editorId, new FormReferenceStatusQuery(formIds));
    }

    private scanScope(editor: EditorState): Promise<FormDeclarationsResult> {
        const { scopeKey } = editor;
        const existing = this.scopeScans.get(scopeKey);
        if (existing) return existing;

        const scan = this.locator.findFormDeclarations(editor.sourcePath);
        this.scopeScans.set(scopeKey, scan);
        const clear = (): void => {
            if (this.scopeScans.get(scopeKey) === scan) this.scopeScans.delete(scopeKey);
        };
        void scan.then(clear, clear);
        return scan;
    }
}
