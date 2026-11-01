import { asyncDebounce, serializeAsync } from "@miragon/bpmn-modeler-types";

import { createFlushResponder, type FlushSource } from "./documentFlush";
import { type HostDocumentReceipt, HostDocumentRevisions } from "./hostDocumentRevisions";
import type { InertLock } from "./inertLock";
import { type DocumentFlushedCommand, LogErrorCommand, SyncDocumentCommand } from "./messages";

/** The document I/O the sync needs from whichever modeler is live. */
export interface DocumentSyncSurface {
    importDocument(content: string | undefined): Promise<void>;
    exportDocument(): Promise<string>;
    /** Runs after each outbound sync was posted. */
    afterSync?(): void;
    /** Whether the surface holds input it has not applied to the document yet. */
    hasPendingInput?(): boolean;
    /** Applies that input to the document now. */
    flushPendingInput?(): void;
}

export interface WebviewDocumentSyncOptions {
    readonly surface: DocumentSyncSurface;
    /** Held while a destructive host flush (close, revert) inspects pending work. */
    readonly flushLock: InertLock;
    /** Whether the modeler finished bootstrapping, for the flush protocol. */
    readonly isReady: () => boolean;
}

type DocumentSyncMessage = SyncDocumentCommand | DocumentFlushedCommand | LogErrorCommand;

type DocumentSyncChannel = { postMessage: (message: DocumentSyncMessage) => void };

export const HOST_UPDATE_DEBOUNCE_MS = 100;
// The host recovers the sub-300ms tail through the flush protocol.
export const SYNC_DEBOUNCE_MS = 300;

/**
 * A modeler webview's document synchronisation with its host, shared by the
 * BPMN and DMN webviews: host revisions, the serialized modeler-operation
 * queue, the debounced host import, the debounced outbound sync and the flush
 * protocol. Each webview keeps only its own boot sequence on top.
 */
export class WebviewDocumentSync implements FlushSource {
    private readonly revisions = new HostDocumentRevisions();
    private readonly surface: DocumentSyncSurface;
    private readonly flushLock: InertLock;
    private disposed = false;

    private readonly serializedOperation = serializeAsync(
        async (operation: () => Promise<void>): Promise<void> => operation(),
    );
    private readonly debouncedHostUpdate = asyncDebounce(
        (content: string | undefined, documentRevision: number) =>
            this.importNow(content, documentRevision),
        HOST_UPDATE_DEBOUNCE_MS,
    );
    private readonly debouncedSync = asyncDebounce(() => this.sendChanges(), SYNC_DEBOUNCE_MS, {
        maxWait: 1000,
    });

    readonly respondToFlush = createFlushResponder(this, (reply) => this.post(reply));

    readonly isReady: () => boolean;

    constructor(
        private readonly host: DocumentSyncChannel,
        { surface, flushLock, isReady }: WebviewDocumentSyncOptions,
    ) {
        this.surface = surface;
        this.flushLock = flushLock;
        this.isReady = isReady;
    }

    /**
     * Records a host push. An update drops any pending outbound sync: the
     * host's copy is authoritative, so a stale export must not clobber it.
     */
    receive(documentRevision: number): HostDocumentReceipt {
        const receipt = this.revisions.receive(documentRevision);
        if (receipt === "update") {
            this.debouncedSync.cancel();
        }
        return receipt;
    }

    /** Queues `operation` behind every import and operation ahead of it. */
    runExclusive(operation: () => Promise<void>): Promise<void> {
        return this.serializedOperation(operation);
    }

    importNow(content: string | undefined, documentRevision: number): Promise<void> {
        return this.serializedOperation(async () => {
            await this.surface.importDocument(content);
            this.revisions.markImported(documentRevision);
        });
    }

    importDebounced(content: string | undefined, documentRevision: number): Promise<void> {
        return this.debouncedHostUpdate(content, documentRevision);
    }

    /** Drains debounced host imports; a failed one is reported and the drain goes on. */
    async flushPendingImports(onError: (error: unknown) => void): Promise<void> {
        while (this.debouncedHostUpdate.pending()) {
            try {
                await this.debouncedHostUpdate.flush();
            } catch (error) {
                onError(error);
            }
        }
    }

    cancelPendingImports(): void {
        this.debouncedHostUpdate.cancel();
    }

    scheduleSync(): void {
        this.revisions.markEdited();
        void this.debouncedSync();
    }

    /** Fires the pending sync once, without waiting for one it schedules. */
    flushSyncOnce(): Promise<void> {
        return this.debouncedSync.flush();
    }

    async flushPendingSync(): Promise<void> {
        this.surface.flushPendingInput?.();
        await this.flushScheduledSync();
    }

    /** Drains the scheduled sync and leaves input the surface still holds unapplied. */
    async flushScheduledSync(): Promise<void> {
        while (this.debouncedSync.pending()) {
            await this.debouncedSync.flush();
        }
    }

    cancelPendingSync(): void {
        this.debouncedSync.cancel();
    }

    hasPendingSync(): boolean {
        return this.debouncedSync.pending() || (this.surface.hasPendingInput?.() ?? false);
    }

    hasPendingHostUpdate(): boolean {
        return this.debouncedHostUpdate.pending();
    }

    isEditedSinceHostImport(): boolean {
        return this.revisions.isEditedSinceImport;
    }

    hostUpdateVersion(): number {
        return this.revisions.version;
    }

    documentRevision(): number {
        return this.revisions.representedRevision;
    }

    beginDestructiveFlush(): void {
        this.flushLock.acquire();
    }

    endDestructiveFlush(): void {
        this.flushLock.release();
    }

    async exportContent(): Promise<string> {
        this.surface.flushPendingInput?.();
        return this.surface.exportDocument();
    }

    /** Stops posting to the host and drops every pending import and sync. */
    dispose(): void {
        this.disposed = true;
        this.debouncedSync.cancel();
        this.debouncedHostUpdate.cancel();
        this.flushLock.release();
    }

    private async sendChanges(): Promise<void> {
        // The modeler's event bus discards the returned promise, so an uncaught
        // rejection would only reach the global hook as a context-free line.
        try {
            const versionAtExport = this.revisions.version;
            const content = await this.surface.exportDocument();
            if (!this.revisions.isCurrent(versionAtExport) || this.debouncedHostUpdate.pending()) {
                return;
            }
            this.post(new SyncDocumentCommand(content, this.revisions.representedRevision));
            this.surface.afterSync?.();
        } catch (error) {
            const e = error instanceof Error ? error : new Error(String(error));
            this.post(new LogErrorCommand(`Failed to sync diagram changes: ${e.message}`, e.stack));
        }
    }

    private post(message: DocumentSyncMessage): void {
        if (!this.disposed) {
            this.host.postMessage(message);
        }
    }
}
