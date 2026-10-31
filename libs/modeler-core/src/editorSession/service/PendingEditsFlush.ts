import { LoggerPort } from "../../kernel/domain/hostPorts";
import { ModelerDocumentService } from "./EditorDocumentSync";
import { EditorSessionStore } from "./EditorSessionStore";
import { DocumentFlushService } from "./DocumentFlushService";

export type PendingEditsFlushResult =
    { status: "safe"; session: object } | { status: "unavailable" } | { status: "closed" };

export type ModelerFileExtension = ".bpmn" | ".dmn" | ".form" | ".json";

export interface PendingEditsFlushOptions {
    destructive?: boolean;
}

type DocumentSyncer = Pick<ModelerDocumentService, "sync">;

/**
 * Brings the host document up to date with the webview before it is persisted
 * or reloaded: the webview's outbound sync is debounced, so the document can
 * trail the live model. Never rejects; anything short of a confirmed flush is
 * `unavailable`, and a save proceeds best-effort.
 *
 * A clean reply still drains the editor queue, because a sync posted just
 * before that reply may still be applying to the host document. Syncing runs
 * through the modeler served for the file's extension, inside the editor
 * queue, so the echo of the write is suppressed like any webview sync.
 */
export class PendingEditsFlush {
    private readonly modelers = new Map<ModelerFileExtension, DocumentSyncer>();

    constructor(
        private readonly editorStore: EditorSessionStore,
        private readonly flushes: DocumentFlushService,
        private readonly logger: LoggerPort,
    ) {}

    serve(extension: ModelerFileExtension, modeler: DocumentSyncer): void {
        this.modelers.set(extension, modeler);
    }

    /** Never crosses into a replacement editor session for the same document. */
    async flushIntoDocument(
        editorId: string,
        { destructive = false }: PendingEditsFlushOptions = {},
    ): Promise<PendingEditsFlushResult> {
        const session = this.editorStore.captureEditorSession(editorId);
        if (!session) return { status: "closed" };

        const modeler = this.modelerFor(editorId);
        if (!modeler) return { status: "unavailable" };

        try {
            const result = await this.flushes.requestFlush(editorId, { destructive });
            if (!this.editorStore.isCurrentEditorSession(editorId, session)) {
                if (destructive) this.flushes.releaseFlush(editorId, session);
                return { status: "closed" };
            }
            if (result.status === "unavailable") {
                await this.editorStore.waitForEditorQueue(editorId);
                if (destructive) this.flushes.releaseFlush(editorId, session);
                return result;
            }
            if (result.status === "host-updated") {
                return { status: "safe", session };
            }
            if (result.status === "clean") {
                await this.editorStore.waitForEditorQueue(editorId);
                if (!this.editorStore.isCurrentEditorSession(editorId, session)) {
                    if (destructive) this.flushes.releaseFlush(editorId, session);
                    return { status: "closed" };
                }
                if (!this.editorStore.isLatestDocumentSyncApplied(editorId, session)) {
                    if (destructive) this.flushes.releaseFlush(editorId, session);
                    return { status: "unavailable" };
                }
                return { status: "safe", session };
            }

            await this.editorStore.runInEditorQueue(editorId, () =>
                modeler.sync(editorId, result.content, result.documentRevision),
            );
            if (!this.editorStore.isCurrentEditorSession(editorId, session)) {
                if (destructive) this.flushes.releaseFlush(editorId, session);
                return { status: "closed" };
            }
            if (!this.editorStore.documentMatches(editorId, session, result.content)) {
                if (destructive) this.flushes.releaseFlush(editorId, session);
                return { status: "unavailable" };
            }
            this.editorStore.recordDocumentSync(editorId, session, result.content);
            return { status: "safe", session };
        } catch (error) {
            if (destructive) this.flushes.releaseFlush(editorId, session);
            this.logger.logError(error instanceof Error ? error : new Error(String(error)));
            return { status: "unavailable" };
        }
    }

    release(editorId: string, session: object): void {
        this.flushes.releaseFlush(editorId, session);
    }

    private modelerFor(editorId: string): DocumentSyncer | undefined {
        const lowerCaseEditorId = editorId.toLowerCase();
        for (const [extension, modeler] of this.modelers) {
            if (lowerCaseEditorId.endsWith(extension)) return modeler;
        }
        return undefined;
    }
}
