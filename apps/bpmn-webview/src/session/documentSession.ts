import {
    type BpmnFileQuery,
    createResolver,
    type DocumentSyncSurface,
    type FlushDocumentQuery,
    type FocusElementQuery,
    type InertLock,
    type InertLockGroup,
    type LanguageQuery,
    LogErrorCommand,
    type ReleaseDocumentFlushQuery,
    WebviewDocumentSync,
} from "@miragon/bpmn-modeler-shared";
import type { DetectedEngine } from "@miragon/bpmn-modeler-types";

import type { HostChannel } from "./hostChannel";

/** The document I/O and view actions the session needs from whichever surface is live. */
export interface BpmnDocumentSurface extends DocumentSyncSurface {
    afterSync(): void;
    hasPendingInput(): boolean;
    flushPendingInput(): void;
    refreshDiagram(): Promise<void>;
    centerOnElement(elementId: string): void;
}

/** The page teardown an engine change runs before the reload replaces the page. */
export interface BpmnPageLifecycle {
    cancelPendingSurfaceWork(): void;
    flushViewport(): void;
    destroySurface(): void;
    reloadPage(): void;
}

export interface Translator {
    getLocale(): string;
    setLanguage(locale: string): void;
}

interface BpmnDocumentSessionPorts {
    readonly surface: BpmnDocumentSurface;
    readonly page: BpmnPageLifecycle;
    readonly translator: Translator;
    readonly pageInertLocks: InertLockGroup;
}

interface DocumentSessionHandlers {
    BpmnFileQuery(query: BpmnFileQuery): Promise<void>;
    LanguageQuery(query: LanguageQuery): Promise<void>;
    FocusElementQuery(query: FocusElementQuery): Promise<void>;
    FlushDocumentQuery(query: FlushDocumentQuery): Promise<void>;
    ReleaseDocumentFlushQuery(query: ReleaseDocumentFlushQuery): Promise<void>;
}

/**
 * The BPMN webview's document lifecycle on top of the shared
 * {@link WebviewDocumentSync}: the engine-reload latch, and actions (language
 * refresh, focus) deferred until the modeler is ready.
 */
export class BpmnDocumentSession {
    readonly document: WebviewDocumentSync;
    private readonly initialHostFile = createResolver<BpmnFileQuery>();
    private latestFile: BpmnFileQuery | undefined;
    // The surface was built for the initial file's engine; any other engine reloads the page.
    private documentEngine: DetectedEngine;
    private initialized = false;
    private canImportHostUpdates = false;
    private engineReloadPending = false;
    private refreshDiagramWhenReady = false;
    private pendingFocusId: string | undefined;
    private pendingActionDrain: Promise<void> | undefined;

    // Never released: the page stays locked until the reload replaces it.
    private readonly engineReloadLock: InertLock;

    private readonly surface: BpmnDocumentSurface;
    private readonly page: BpmnPageLifecycle;
    private readonly translator: Translator;

    readonly handlers: DocumentSessionHandlers = {
        BpmnFileQuery: (query) => this.receiveHostFile(query),
        LanguageQuery: (query) => this.applyLanguage(query.locale),
        FocusElementQuery: (query) => this.focusElement(query.elementId),
        FlushDocumentQuery: (query) => this.document.respondToFlush(query),
        ReleaseDocumentFlushQuery: (query) => this.document.respondToFlush(query),
    };

    constructor(
        private readonly host: HostChannel,
        { surface, page, translator, pageInertLocks }: BpmnDocumentSessionPorts,
    ) {
        this.surface = surface;
        this.page = page;
        this.translator = translator;
        this.document = new WebviewDocumentSync(host, {
            surface,
            flushLock: pageInertLocks.createLock(),
            isReady: () => this.initialized,
        });
        this.engineReloadLock = pageInertLocks.createLock();
    }

    get latestHostFile(): BpmnFileQuery | undefined {
        return this.latestFile;
    }

    get isReloadingForEngine(): boolean {
        return this.engineReloadPending;
    }

    waitForInitialHostFile(): Promise<BpmnFileQuery | undefined> {
        return this.initialHostFile.wait();
    }

    async receiveHostFile(query: BpmnFileQuery): Promise<void> {
        const documentRevision = query.documentRevision ?? 0;
        const receipt = this.document.receive(documentRevision);
        if (receipt === "stale") return;
        this.latestFile = query;

        if (receipt === "initial") {
            this.initialHostFile.done(query);
            return;
        }

        if (!this.canImportHostUpdates) return;
        if (query.engine !== this.documentEngine) {
            await this.reloadForEngineChange();
            return;
        }
        try {
            await this.document.importDebounced(query.content, documentRevision);
        } finally {
            if (this.initialized) {
                await this.drainPendingActions();
            }
        }
    }

    /**
     * Imports the newest host file into a surface built for `firstFile`'s
     * engine; `false` when the boot must stop.
     */
    async openInitialDocument(firstFile: BpmnFileQuery | undefined): Promise<boolean> {
        this.documentEngine = firstFile?.engine;
        let importedFile = this.latestFile ?? firstFile;
        while (importedFile) {
            if (importedFile.engine !== this.documentEngine) {
                await this.reloadForEngineChange();
                return false;
            }
            try {
                await this.document.importNow(importedFile.content, importedFile.documentRevision);
                break;
            } catch (error) {
                if (this.latestFile && this.latestFile !== importedFile) {
                    this.reportHostImportError(error);
                    importedFile = this.latestFile;
                    continue;
                }
                const message = error instanceof Error ? error.message : String(error);
                this.host.postMessage(new LogErrorCommand(`Unable to open XML\n${message}`));
                return false;
            }
        }

        this.canImportHostUpdates = true;

        if (this.latestFile && this.latestFile !== importedFile) {
            if (this.latestFile.engine !== this.documentEngine) {
                await this.reloadForEngineChange();
                return false;
            }
            try {
                await this.document.importDebounced(
                    this.latestFile.content,
                    this.latestFile.documentRevision,
                );
            } catch (error) {
                this.reportHostImportError(error);
            }
        }
        await this.flushPendingHostUpdates();
        return !this.engineReloadPending;
    }

    markInitialized(): void {
        this.initialized = true;
    }

    async applyLanguage(locale: string): Promise<void> {
        // The host pushes the language on every (re)load and an unknown code falls back
        // to "en", so only a changed resolved locale pays for the re-translating re-import.
        const localeBefore = this.translator.getLocale();
        this.translator.setLanguage(locale);
        if (this.translator.getLocale() === localeBefore) return;
        this.refreshDiagramWhenReady = true;
        if (this.initialized) {
            await this.drainPendingActions();
        }
    }

    async focusElement(elementId: string): Promise<void> {
        this.pendingFocusId = elementId;
        if (this.initialized) {
            await this.drainPendingActions();
        }
    }

    /** Queues `operation` behind every import, refresh and the reload teardown ahead of it. */
    runExclusive(operation: () => Promise<void>): Promise<void> {
        return this.document.runExclusive(operation);
    }

    scheduleSync(): void {
        this.document.scheduleSync();
    }

    flushSyncOnHide(): void {
        void this.document.flushSyncOnce();
    }

    flushPendingSync(): Promise<void> {
        return this.document.flushPendingSync();
    }

    async flushBeforeSurfaceDestroy(): Promise<void> {
        // The next surface's XML is exported before this runs, so applying the
        // panel's input now would sync a value that surface does not load.
        await this.document.flushScheduledSync();
        this.document.cancelPendingSync();
    }

    drainPendingActions(): Promise<void> {
        if (!this.pendingActionDrain) {
            this.pendingActionDrain = this.runPendingActions().finally(() => {
                this.pendingActionDrain = undefined;
            });
        }
        return this.pendingActionDrain;
    }

    async reloadForEngineChange(): Promise<void> {
        if (this.engineReloadPending) return;
        this.engineReloadPending = true;
        this.initialized = false;
        this.canImportHostUpdates = false;
        this.document.cancelPendingSync();
        this.document.cancelPendingImports();
        this.page.cancelPendingSurfaceWork();
        this.refreshDiagramWhenReady = false;
        this.pendingFocusId = undefined;
        this.engineReloadLock.acquire();

        await this.document.runExclusive(async () => {
            try {
                this.document.cancelPendingSync();
                this.document.cancelPendingImports();
                await this.document.flushSyncOnce();
                this.page.flushViewport();
            } finally {
                try {
                    this.page.destroySurface();
                } finally {
                    this.page.reloadPage();
                }
            }
        });
    }

    isReady(): boolean {
        return this.initialized;
    }

    private flushPendingHostUpdates(): Promise<void> {
        return this.document.flushPendingImports((error) => this.reportHostImportError(error));
    }

    private async runPendingActions(): Promise<void> {
        while (!this.engineReloadPending) {
            await this.flushPendingHostUpdates();
            if (this.engineReloadPending) return;

            if (this.refreshDiagramWhenReady) {
                this.refreshDiagramWhenReady = false;
                try {
                    await this.document.runExclusive(() => this.surface.refreshDiagram());
                } catch (error) {
                    const cause = error instanceof Error ? error : new Error(String(error));
                    this.host.postMessage(
                        new LogErrorCommand(
                            `Unable to refresh diagram\n${cause.message}`,
                            cause.stack,
                        ),
                    );
                }
                if (this.engineReloadPending) return;
                continue;
            }

            if (this.document.hasPendingHostUpdate()) {
                continue;
            }

            if (this.pendingFocusId !== undefined) {
                this.surface.centerOnElement(this.pendingFocusId);
                this.pendingFocusId = undefined;
            }
            return;
        }
    }

    private reportHostImportError(error: unknown): void {
        const cause = error instanceof Error ? error : new Error(String(error));
        this.host.postMessage(
            new LogErrorCommand(`Unable to open host XML\n${cause.message}`, cause.stack),
        );
    }
}
