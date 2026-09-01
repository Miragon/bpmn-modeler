import { FormReferenceStatusQuery } from "@miragon/bpmn-modeler-shared";

import { DocumentPort, NotifierPort, WorkspacePort } from "../../shared/domain/hostPorts";
import { pathIsInsideExcludedDir } from "../../shared/domain/excludedDirs";
import { EditorSessionStore } from "../../shared/infrastructure/EditorSessionStore";
import { FormDeclarationsResult, ReferencedModelLocator } from "./ReferencedModelLocator";

const WATCH_DEBOUNCE_MS = 150;

interface EditorState {
    sourcePath: string;
    roots: string[];
    token: symbol;
    lastSignature?: string;
}

interface RootState {
    editors: Set<string>;
    watcher: { dispose(): void };
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
        this.registerEditor(editorId);
        await this.queueRefresh(editorId, true);
    }

    disposeEditor(editorId: string): void {
        const editor = this.editors.get(editorId);
        if (!editor) return;
        this.editors.delete(editorId);
        this.refreshChains.delete(editorId);

        for (const root of editor.roots) {
            const state = this.roots.get(root);
            if (!state) continue;
            state.editors.delete(editorId);
            if (state.editors.size === 0) {
                state.watcher.dispose();
                this.roots.delete(root);
                this.pendingRoots.delete(root);
            }
        }

        const scope = this.scopeKey(editor);
        if (![...this.editors.values()].some((state) => this.scopeKey(state) === scope)) {
            this.scopeScans.delete(scope);
        }
    }

    dispose(): void {
        this.disposed = true;
        if (this.watchTimer !== undefined) clearTimeout(this.watchTimer);
        this.watchTimer = undefined;
        for (const state of this.roots.values()) state.watcher.dispose();
        this.roots.clear();
        this.editors.clear();
        this.refreshChains.clear();
        this.scopeScans.clear();
        this.pendingRoots.clear();
    }

    private registerEditor(editorId: string): void {
        if (this.editors.has(editorId)) return;
        const sourcePath = this.document.getFilePath(editorId);
        const inWorkspace = this.workspace.findWorkspaceFolderForDocument(sourcePath) !== undefined;
        const roots = inWorkspace
            ? this.workspace.getWorkspaceFolderPaths()
            : [this.workspace.getDocumentDirectory(sourcePath)];
        const state: EditorState = { sourcePath, roots, token: Symbol(editorId) };
        this.editors.set(editorId, state);

        for (const root of roots) this.acquireRoot(root, editorId);
    }

    private acquireRoot(root: string, editorId: string): void {
        const existing = this.roots.get(root);
        if (existing) {
            existing.editors.add(editorId);
            return;
        }

        const changed = (path: string) => {
            if (!pathIsInsideExcludedDir(path)) this.scheduleRefresh(root);
        };
        try {
            const watcher = this.workspace.createWatcher(root, "**/*.form", {
                onChange: changed,
                onCreate: changed,
                onDelete: changed,
            });
            this.roots.set(root, { editors: new Set([editorId]), watcher });
        } catch (error) {
            this.notifier.logWarning(
                `Could not watch Camunda Forms under ${root}: ${(error as Error).message}`,
            );
        }
    }

    private scheduleRefresh(root: string): void {
        for (const editorId of this.roots.get(root)?.editors ?? []) {
            const editor = this.editors.get(editorId);
            if (editor) this.scopeScans.delete(this.scopeKey(editor));
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
        if (result.kind === "matches") {
            result.readFailures.forEach((failure) => this.notifier.logWarning(failure));
            formIds = [...new Set(result.declarations.map(({ id }) => id))].sort();
        } else if (result.kind === "all-unreadable") {
            result.failures.forEach((failure) => this.notifier.logWarning(failure));
        }

        const signature = JSON.stringify(formIds);
        if (!force && signature === editor.lastSignature) return;
        editor.lastSignature = signature;
        await this.editorStore.postMessage(editorId, new FormReferenceStatusQuery(formIds));
    }

    private scanScope(editor: EditorState): Promise<FormDeclarationsResult> {
        const scope = this.scopeKey(editor);
        const existing = this.scopeScans.get(scope);
        if (existing) return existing;

        const scan = this.locator.findFormDeclarations(editor.sourcePath);
        this.scopeScans.set(scope, scan);
        const clear = (): void => {
            if (this.scopeScans.get(scope) === scan) this.scopeScans.delete(scope);
        };
        void scan.then(clear, clear);
        return scan;
    }

    private scopeKey(editor: EditorState): string {
        return editor.roots.join("\0");
    }
}
