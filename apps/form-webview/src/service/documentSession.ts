import {
    FORM_INVALID_JSON_MESSAGE,
    FORM_SCHEMA_IMPORT_ERROR_MESSAGE,
    type FlushSource,
    HostDocumentRevisions,
    type InertLock,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";
import { serializeAsync } from "@miragon/bpmn-modeler-types";

import type {
    FormDocumentLoadListener,
    FormSchema,
    FormSchemaEditor,
    PendingEditorInput,
} from "../port/formDocument";

const SYNC_DELIVERY_GRACE_MS = 200;

interface SyncChannel {
    postMessage(message: SyncDocumentCommand): void;
}

/** Locks from one group on the page, so a destructive flush and a host import never unlock each other. */
export interface FormDocumentLocks {
    flush: InertLock;
    hostImport: InertLock;
}

function serialize(schema: FormSchema): string {
    return JSON.stringify(schema, null, 2);
}

/**
 * The form webview's copy of the host document. It posts each visual edit at
 * once instead of debouncing, and posts the host's own text back while the
 * schema still equals the one it imported.
 */
export class FormDocumentSession implements FlushSource {
    private activeHostUpdates = 0;
    private readonly importSchemaInOrder = serializeAsync((schema: FormSchema) =>
        this.editor.importSchema(schema),
    );
    private readonly revisions = new HostDocumentRevisions();
    private sourceContent = "";
    private baseline = "";
    private lastPostedContent = "";
    private syncDeliveryTimer: ReturnType<typeof setTimeout> | undefined;

    constructor(
        private readonly editor: FormSchemaEditor,
        private readonly editorInput: PendingEditorInput,
        private readonly host: SyncChannel,
        private readonly locks: FormDocumentLocks,
    ) {}

    get holdsDocument(): boolean {
        return this.baseline !== "";
    }

    async load(
        content: string,
        documentRevision: number,
        listener: FormDocumentLoadListener,
    ): Promise<void> {
        if (this.revisions.receive(documentRevision) === "stale") return;
        const version = this.revisions.version;
        this.cancelPendingSync();
        listener.onArrived(this.holdsDocument);

        let schema: FormSchema;
        try {
            schema = JSON.parse(content) as FormSchema;
        } catch (error) {
            this.fail(listener, FORM_INVALID_JSON_MESSAGE, error);
            return;
        }

        this.activeHostUpdates++;
        this.locks.hostImport.acquire();
        try {
            const result = await this.importSchemaInOrder(schema);
            if (!this.revisions.isCurrent(version)) return;

            this.revisions.markImported(documentRevision);
            this.sourceContent = content;
            this.baseline = serialize(this.editor.saveSchema());
            this.lastPostedContent = content;
            await listener.onImported(result.warnings ?? []);
        } catch (error) {
            if (this.revisions.isCurrent(version)) {
                this.fail(listener, FORM_SCHEMA_IMPORT_ERROR_MESSAGE, error);
            }
        } finally {
            this.activeHostUpdates--;
            if (this.activeHostUpdates === 0) this.locks.hostImport.release();
        }
    }

    /** Posts the editor's schema when it differs from the last one posted. */
    syncChangedContent(): void {
        if (!this.syncCurrentContent()) return;
        if (this.syncDeliveryTimer !== undefined) clearTimeout(this.syncDeliveryTimer);
        this.syncDeliveryTimer = setTimeout(() => {
            this.syncDeliveryTimer = undefined;
        }, SYNC_DELIVERY_GRACE_MS);
    }

    isReady(): boolean {
        return this.holdsDocument;
    }

    hasPendingSync(): boolean {
        return this.syncDeliveryTimer !== undefined || this.editorInput.hasPending();
    }

    hasPendingHostUpdate(): boolean {
        return this.activeHostUpdates > 0;
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

    cancelPendingSync(): void {
        if (this.syncDeliveryTimer !== undefined) clearTimeout(this.syncDeliveryTimer);
        this.syncDeliveryTimer = undefined;
    }

    flushPendingSync(): Promise<void> {
        this.editorInput.flush();
        if (this.hasPendingSync()) {
            this.cancelPendingSync();
            this.syncCurrentContent(true);
        }
        return Promise.resolve();
    }

    beginDestructiveFlush(): void {
        this.locks.flush.acquire();
    }

    endDestructiveFlush(): void {
        this.locks.flush.release();
    }

    async exportContent(): Promise<string> {
        this.editorInput.flush();
        return this.currentContent();
    }

    private fail(listener: FormDocumentLoadListener, message: string, cause: unknown): void {
        this.cancelPendingSync();
        this.baseline = "";
        listener.onFailed(message, cause);
    }

    private syncCurrentContent(force = false): boolean {
        if (this.activeHostUpdates > 0 || !this.holdsDocument) return false;
        const content = this.currentContent();
        if (!force && content === this.lastPostedContent) return false;
        this.lastPostedContent = content;
        this.revisions.markEdited();
        this.host.postMessage(new SyncDocumentCommand(content, this.revisions.representedRevision));
        return true;
    }

    private currentContent(): string {
        const serialized = serialize(this.editor.saveSchema());
        return serialized === this.baseline ? this.sourceContent : serialized;
    }
}
