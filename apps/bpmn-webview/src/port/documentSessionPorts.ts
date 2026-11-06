import type { DocumentSyncSurface } from "@miragon/bpmn-modeler-shared";

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
