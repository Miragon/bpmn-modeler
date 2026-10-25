import { asyncDebounce, serializeAsync } from "@miragon/bpmn-modeler-types";

import { createFlushResponder, type FlushSource } from "./documentFlush";
import { type HostDocumentReceipt, HostDocumentRevisions } from "./hostDocumentRevisions";
import type { InertLock } from "./inertLock";
import { type Command, LogErrorCommand, type Query, SyncDocumentCommand } from "./messages";

/** The document I/O the sync needs from whichever modeler is live. */
export interface DocumentSyncSurface {
    importDocument(content: string | undefined): Promise<void>;
    exportDocument(): Promise<string>;
    /** Runs after each outbound sync was posted. */
    afterSync?(): void;
}

export interface WebviewDocumentSyncOptions {
    readonly surface: DocumentSyncSurface;
    /** Held while a destructive host flush (close, revert) inspects pending work. */
    readonly flushLock: InertLock;
    /** Whether the modeler finished bootstrapping, for the flush protocol. */
    readonly isReady: () => boolean;
}

type HostChannel = { postMessage(message: Command | Query): void };

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
        100,
    );
    // The host recovers the sub-300ms tail through the flush protocol.
    private readonly debouncedSync = asyncDebounce(() => this.sendChanges(), 300, {
        maxWait: 1000,
    });

    readonly respondToFlush = createFlushResponder(this, (reply) => this.post(reply));

    readonly isReady: () => boolean;

    constructor(
        private readonly host: HostChannel,
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
        void this.debouncedSync();
    }

    /** Fires the pending sync once, without waiting for one it schedules. */
    flushSyncOnce(): Promise<void> {
        return this.debouncedSync.flush();
    }

    async flushPendingSync(): Promise<void> {
        while (this.debouncedSync.pending()) {
            await this.debouncedSync.flush();
        }
    }

    cancelPendingSync(): void {
        this.debouncedSync.cancel();
    }

    hasPendingSync(): boolean {
        return this.debouncedSync.pending();
    }

    hasPendingHostUpdate(): boolean {
        return this.debouncedHostUpdate.pending();
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

    exportContent(): Promise<string> {
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

    private post(message: Command | Query): void {
        if (!this.disposed) {
            this.host.postMessage(message);
        }
    }
}
