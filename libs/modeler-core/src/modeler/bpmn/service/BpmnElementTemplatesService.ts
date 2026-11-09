import { posix } from "path";

import { ElementTemplatesQuery } from "@miragon/bpmn-modeler-shared";

import { DocumentPort, NotifierPort, StatusBarPort } from "../../../kernel/port/hostPorts";
import { EditorSessionStore } from "../../../editorSession/service/EditorSessionStore";
import { ArtifactChangeTarget, ArtifactService } from "../../../kernel/service/ArtifactService";
import { updateStatusSlot } from "../../../kernel/service/updateStatusSlot";
import {
    ElementTemplateSource,
    EMPTY_TEMPLATE_SOURCE,
    mergeElementTemplates,
    templatesOfFileText,
} from "../domain/elementTemplates";
import { elementTemplatesStatusView } from "../domain/elementTemplatesStatusView";
import { TemplateLoadStatus } from "../domain/TemplateLoadStatus";
import { ElementTemplateCache } from "./ElementTemplateCache";

const REFRESH_DEBOUNCE_MS = 150;

/**
 * Declared structurally (not as a `TemplateMarketplaceService` import) so the
 * template pipeline stays decoupled from the marketplace feature: a host that
 * wires no marketplace simply passes nothing.
 */
export interface CachedTemplateProvider {
    getCachedTemplatePaths(): Promise<string[]>;
}

/**
 * Loads BPMN element templates from the workspace and pushes them to the
 * webview. Parsed templates are cached per template directory and shared by
 * every editor of the host, so a second editor or a tab re-show reads nothing
 * from disk. Implements {@link ArtifactChangeTarget} so the artifact watcher
 * created by {@link ArtifactService.createWatcher} invalidates and reloads them
 * when a template file changes on disk.
 */
export class BpmnElementTemplatesService implements ArtifactChangeTarget {
    private readonly cache = new ElementTemplateCache();
    private readonly latestRequests = new Map<string, symbol>();
    private readonly templateDirsByEditor = new Map<string, readonly string[]>();
    private readonly editorsAwaitingRefresh = new Set<string>();
    private readonly staleOnRefresh = { directories: false, marketplace: false };
    private refreshTimer: ReturnType<typeof setTimeout> | undefined;
    private templateLoadStatus = TemplateLoadStatus.idle;
    private readonly templateDirListeners = new Set<() => void>();

    /**
     * @param marketplaceSvc Absent in hosts without the marketplace feature, so
     *   the workspace-only behaviour is unchanged.
     */
    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly vsDocument: DocumentPort,
        private readonly artifactSvc: ArtifactService,
        private readonly statusBar: StatusBarPort,
        private readonly notifier: NotifierPort,
        private readonly marketplaceSvc?: CachedTemplateProvider,
    ) {}

    async setElementTemplates(editorId: string): Promise<boolean> {
        if (!this.editorStore.hasEditor(editorId)) {
            this.notifier.logDebug(
                `Skipping element-template load for disposed editor: ${editorId}`,
            );
            return false;
        }

        const request = Symbol(editorId);
        this.latestRequests.set(editorId, request);
        const isSuperseded = () => this.latestRequests.get(editorId) !== request;

        try {
            const documentDir = posix.dirname(this.vsDocument.getFilePath(editorId));
            const templateDirs = await this.artifactSvc.getTemplateDirs(documentDir);
            if (isSuperseded()) {
                return false;
            }
            this.recordTemplateDirs(() => this.templateDirsByEditor.set(editorId, templateDirs));

            // Served from the cache (a tab re-show, a second editor) the load is
            // instant, so a progress indicator would only flash.
            const readsFromDisk = this.needsDiskRead(templateDirs);
            if (readsFromDisk) {
                this.recordTemplateLoad(this.templateLoadStatus.started(request));
            }

            const sources = await Promise.all([
                ...templateDirs.map((dir) =>
                    this.cache.directory(dir, () => this.loadDirectory(dir)),
                ),
                this.loadMarketplaceTemplates(),
            ]);
            if (isSuperseded()) {
                if (readsFromDisk) {
                    this.recordTemplateLoad(this.templateLoadStatus.abandoned(request));
                }
                return false;
            }
            const templates = mergeElementTemplates(sources);

            const outcome = await this.editorStore.postUnlessHidden(
                editorId,
                new ElementTemplatesQuery(templates),
            );
            if (outcome === "sent") {
                if (readsFromDisk) {
                    this.reportLoaded(request, templates.length, sources);
                }
                return true;
            }
            this.recordTemplateLoad(this.templateLoadStatus.abandoned(request));
            if (outcome === "hidden") {
                // Shown again, the webview restarts and asks for its templates itself.
                this.notifier.logDebug(`Element templates not sent to hidden editor: ${editorId}`);
                return false;
            }
            return this.handleError(new Error("Setting the `elementTemplates` failed."));
        } catch (error) {
            this.recordTemplateLoad(this.templateLoadStatus.abandoned(request));
            if (!this.editorStore.hasEditor(editorId)) {
                this.notifier.logDebug(
                    `Element-template load aborted; editor disposed mid-load: ${editorId}`,
                );
                return false;
            }
            return this.handleError(error as Error);
        }
    }

    refreshElementTemplates(editorId: string): void {
        this.staleOnRefresh.directories = true;
        this.scheduleRefresh(editorId);
    }

    /** For a change of the registered marketplaces, which leaves the template folders as they are. */
    refreshMarketplaceTemplates(editorId: string): void {
        this.staleOnRefresh.marketplace = true;
        this.scheduleRefresh(editorId);
    }

    async reloadMarketplaceTemplates(): Promise<void> {
        this.cache.forgetMarketplace();
        // Only editors that asked for templates release them again; the store
        // also holds DMN and form editors.
        for (const editorId of [...this.latestRequests.keys()]) {
            await this.setElementTemplates(editorId);
        }
    }

    releaseEditor(editorId: string): void {
        this.latestRequests.delete(editorId);
        this.editorsAwaitingRefresh.delete(editorId);
        this.recordTemplateDirs(() => this.templateDirsByEditor.delete(editorId));
        // Only an open editor's watcher keeps an entry fresh; without one a
        // change on disk would go unnoticed until the host restarts.
        this.cache.forgetDirectories(new Set([...this.templateDirsByEditor.values()].flat()));
        if (this.templateDirsByEditor.size === 0) {
            this.cache.forgetMarketplace();
        }
    }

    /** The template folders the open editors loaded, nested ones included, each once. */
    knownTemplateDirs(): string[] {
        return [...new Set([...this.templateDirsByEditor.values()].flat())];
    }

    onDidChangeTemplateDirs(listener: () => void): { dispose(): void } {
        this.templateDirListeners.add(listener);
        return { dispose: () => this.templateDirListeners.delete(listener) };
    }

    dispose(): void {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = undefined;
        this.editorsAwaitingRefresh.clear();
    }

    private recordTemplateDirs(change: () => void): void {
        const before = this.knownTemplateDirs().join("\n");
        change();
        if (this.knownTemplateDirs().join("\n") !== before) {
            this.templateDirListeners.forEach((listener) => listener());
        }
    }

    private scheduleRefresh(editorId: string): void {
        this.editorsAwaitingRefresh.add(editorId);
        clearTimeout(this.refreshTimer);
        // One file change fires the watcher of every editor under the same
        // root; coalescing them invalidates once and lets those editors share
        // a single re-read.
        this.refreshTimer = setTimeout(() => this.refreshAwaitingEditors(), REFRESH_DEBOUNCE_MS);
    }

    private refreshAwaitingEditors(): void {
        this.refreshTimer = undefined;
        const editorIds = [...this.editorsAwaitingRefresh];
        this.editorsAwaitingRefresh.clear();
        if (this.staleOnRefresh.directories) {
            this.cache.forgetDirectories();
        }
        if (this.staleOnRefresh.marketplace) {
            this.cache.forgetMarketplace();
        }
        this.staleOnRefresh.directories = false;
        this.staleOnRefresh.marketplace = false;
        for (const editorId of editorIds) {
            this.setElementTemplates(editorId).catch((error) => {
                this.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            });
        }
    }

    private needsDiskRead(templateDirs: readonly string[]): boolean {
        return (
            templateDirs.some((dir) => !this.cache.holdsDirectory(dir)) ||
            (this.marketplaceSvc !== undefined && !this.cache.holdsMarketplace())
        );
    }

    private loadMarketplaceTemplates(): Promise<ElementTemplateSource> {
        const marketplace = this.marketplaceSvc;
        if (!marketplace) {
            return Promise.resolve(EMPTY_TEMPLATE_SOURCE);
        }
        return this.cache.marketplaceTemplates(async () =>
            this.parseTemplateFiles(await marketplace.getCachedTemplatePaths()),
        );
    }

    private async loadDirectory(dir: string): Promise<ElementTemplateSource> {
        const files = await this.artifactSvc.readDirectory(dir, ".json");
        this.notifier.logDebug(
            files.length > 0
                ? `Element-template files resolved: ${files.join(", ")}`
                : `No element-template files in ${dir}.`,
        );
        return this.parseTemplateFiles(files);
    }

    private async parseTemplateFiles(files: string[]): Promise<ElementTemplateSource> {
        const templatesPerFile = await Promise.all(
            files.map(async (file) => {
                try {
                    return templatesOfFileText(await this.artifactSvc.readFile(file));
                } catch (error) {
                    this.notifier.logError(
                        new Error(
                            `Failed to parse element template "${file}": ${(error as Error).message}`,
                        ),
                    );
                    return [];
                }
            }),
        );
        return { fileCount: files.length, templates: templatesPerFile.flat() };
    }

    private reportLoaded(
        request: symbol,
        templateCount: number,
        sources: readonly ElementTemplateSource[],
    ): void {
        this.recordTemplateLoad(this.templateLoadStatus.finished(request, templateCount));
        const fileCount = sources.reduce((sum, source) => sum + source.fileCount, 0);
        if (fileCount > 0) {
            this.notifier.logInfo(
                `${templateCount} element template(s) loaded from ${fileCount} file(s).`,
            );
        }
    }

    private recordTemplateLoad(status: TemplateLoadStatus): void {
        this.templateLoadStatus = status;
        updateStatusSlot(
            this.statusBar,
            "elementTemplates",
            elementTemplatesStatusView(status.display),
        );
    }

    private handleError(error: Error): boolean {
        this.notifier.notifyError("A problem occurred while loading element templates.", error);
        return false;
    }
}
