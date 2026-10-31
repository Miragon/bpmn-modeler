import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    DocumentFlushedCommand,
    DocumentFlushStatus,
    FlushDocumentQuery,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost, FakeEditorHandle, TestHost } from "../../testing";
import { DocumentFlushService } from "./DocumentFlushService";
import {
    ModelerFileExtension,
    PendingEditsFlush,
    PendingEditsFlushResult,
} from "./PendingEditsFlush";

interface RecordedSync {
    editorId: string;
    content: string;
    documentRevision?: number;
}

/** Writes each sync into the host document, as the modeler services do. */
class RecordingModeler {
    readonly syncs: RecordedSync[] = [];

    constructor(private readonly host: TestHost) {}

    sync(editorId: string, content: string, documentRevision?: number): Promise<boolean> {
        this.syncs.push({ editorId, content, documentRevision });
        return this.host.documents.write(editorId, content);
    }
}

describe("PendingEditsFlush", () => {
    let host: TestHost;
    let flushes: DocumentFlushService;
    let pendingEdits: PendingEditsFlush;
    let modelers: Record<ModelerFileExtension, RecordingModeler>;

    beforeEach(() => {
        host = createTestHost();
        flushes = new DocumentFlushService(host.store, host.notifier);
        pendingEdits = new PendingEditsFlush(host.store, flushes, host.notifier);
        modelers = {
            ".bpmn": new RecordingModeler(host),
            ".dmn": new RecordingModeler(host),
            ".form": new RecordingModeler(host),
            ".json": new RecordingModeler(host),
        };
        for (const extension of [".bpmn", ".dmn", ".form", ".json"] as const) {
            pendingEdits.serve(extension, modelers[extension]);
        }
    });

    function lastFlushQuery(editor: FakeEditorHandle): FlushDocumentQuery {
        return editor.postedOfType<FlushDocumentQuery>("FlushDocumentQuery").at(-1)!;
    }

    function webviewReplies(
        editor: FakeEditorHandle,
        status: DocumentFlushStatus,
        content?: string,
        documentRevision?: number,
    ): void {
        flushes.handleReply(
            new DocumentFlushedCommand(
                lastFlushQuery(editor).token,
                content,
                status,
                documentRevision,
            ),
            editor.id,
        );
    }

    /** Occupies the editor queue the way a webview sync still being applied does. */
    function holdEditorQueue(editor: FakeEditorHandle): () => void {
        let finishSync: () => void = () => {};
        void host.store.runInEditorQueue(
            editor.id,
            () =>
                new Promise<void>((resolve) => {
                    finishSync = resolve;
                }),
        );
        return () => finishSync();
    }

    function track(flushing: Promise<PendingEditsFlushResult>): {
        outcome: () => PendingEditsFlushResult | undefined;
    } {
        let outcome: PendingEditsFlushResult | undefined;
        void flushing.then((result) => {
            outcome = result;
        });
        return { outcome: () => outcome };
    }

    function allSyncs(): RecordedSync[] {
        return Object.values(modelers).flatMap((modeler) => modeler.syncs);
    }

    it.each<[string, ModelerFileExtension]>([
        ["/work/diagram.bpmn", ".bpmn"],
        ["/work/Order.BPMN", ".bpmn"],
        ["/work/decision.dmn", ".dmn"],
        ["/work/Decision.Dmn", ".dmn"],
        ["/work/form.form", ".form"],
        ["/work/Form.FORM", ".form"],
        ["/work/template.json", ".json"],
    ])(
        "syncs flushed content for %s through the modeler served for %s files",
        async (path, extension) => {
            const editor = host.openEditor(path, "<v1/>");

            const flushing = pendingEdits.flushIntoDocument(editor.id);
            expect(editor.postedOfType("FlushDocumentQuery")).toHaveLength(1);
            webviewReplies(editor, "flushed", "<v2/>", 7);

            await expect(flushing).resolves.toEqual({ status: "safe", session: editor });
            expect(modelers[extension].syncs).toEqual([
                { editorId: editor.id, content: "<v2/>", documentRevision: 7 },
            ]);
            expect(allSyncs()).toHaveLength(1);
            expect(editor.content).toBe("<v2/>");
        },
    );

    it("is unavailable for a file type no modeler serves", async () => {
        const editor = host.openEditor("/work/notes.txt");

        await expect(pendingEdits.flushIntoDocument(editor.id)).resolves.toEqual({
            status: "unavailable",
        });
        expect(editor.postedOfType("FlushDocumentQuery")).toEqual([]);
    });

    it("reports a document no editor has open as closed", async () => {
        await expect(pendingEdits.flushIntoDocument("file:///work/gone.bpmn")).resolves.toEqual({
            status: "closed",
        });
    });

    it("confirms a clean webview without syncing", async () => {
        const editor = host.openEditor("/work/diagram.bpmn", "<v1/>");

        const flushing = pendingEdits.flushIntoDocument(editor.id);
        webviewReplies(editor, "clean");

        await expect(flushing).resolves.toEqual({ status: "safe", session: editor });
        expect(lastFlushQuery(editor).destructive).toBe(false);
        expect(allSyncs()).toEqual([]);
    });

    it("keeps an authoritative host update without waiting for stale webview work", async () => {
        const editor = host.openEditor("/work/diagram.bpmn");
        const finishQueuedSync = holdEditorQueue(editor);

        const flushing = track(pendingEdits.flushIntoDocument(editor.id));
        webviewReplies(editor, "host-updated");

        await vi.waitFor(() =>
            expect(flushing.outcome()).toEqual({ status: "safe", session: editor }),
        );
        expect(allSyncs()).toEqual([]);
        finishQueuedSync();
    });

    it("waits for a sync already queued when the webview reports nothing pending", async () => {
        const editor = host.openEditor("/work/form.form");
        const finishQueuedSync = holdEditorQueue(editor);

        const flushing = pendingEdits.flushIntoDocument(editor.id);
        const tracked = track(flushing);
        webviewReplies(editor, "clean");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(tracked.outcome()).toBeUndefined();

        finishQueuedSync();

        await expect(flushing).resolves.toEqual({ status: "safe", session: editor });
        expect(allSyncs()).toEqual([]);
    });

    it("queues the flushed content behind a webview sync still being applied", async () => {
        const editor = host.openEditor("/work/diagram.bpmn", "<v1/>");
        const finishQueuedSync = holdEditorQueue(editor);

        const flushing = pendingEdits.flushIntoDocument(editor.id);
        webviewReplies(editor, "flushed", "<v2/>");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(allSyncs()).toEqual([]);

        finishQueuedSync();

        await expect(flushing).resolves.toEqual({ status: "safe", session: editor });
        expect(allSyncs()).toEqual([{ editorId: editor.id, content: "<v2/>" }]);
    });

    it("does not confirm clean when the latest normal sync missed the host document", async () => {
        const editor = host.openEditor("/work/form.form", '{"id":"old"}');
        host.store.recordDocumentSync(editor.id, editor, '{"id":"newer"}');

        const flushing = pendingEdits.flushIntoDocument(editor.id);
        webviewReplies(editor, "clean");

        await expect(flushing).resolves.toEqual({ status: "unavailable" });
    });

    it("releases the destructive lock when the latest normal sync missed the host document", async () => {
        const editor = host.openEditor("/work/form.form", '{"id":"old"}');
        host.store.recordDocumentSync(editor.id, editor, '{"id":"newer"}');

        const flushing = pendingEdits.flushIntoDocument(editor.id, { destructive: true });
        const { token } = lastFlushQuery(editor);
        webviewReplies(editor, "clean");

        await expect(flushing).resolves.toEqual({ status: "unavailable" });
        expect(editor.posted.at(-1)).toEqual(new ReleaseDocumentFlushQuery(token));
    });

    it("reports closed when the editor is replaced while queued work drains", async () => {
        const editor = host.openEditor("/work/form.form");
        const finishQueuedSync = holdEditorQueue(editor);

        const flushing = pendingEdits.flushIntoDocument(editor.id);
        webviewReplies(editor, "clean");
        await new Promise((resolve) => setTimeout(resolve, 0));
        host.openEditor("/work/form.form");
        finishQueuedSync();

        await expect(flushing).resolves.toEqual({ status: "closed" });
    });

    it("rejects a late flush result when the original editor session was replaced", async () => {
        const editor = host.openEditor("/work/diagram.bpmn");

        const flushing = pendingEdits.flushIntoDocument(editor.id);
        host.openEditor("/work/diagram.bpmn");
        webviewReplies(editor, "flushed", "<xml/>");

        await expect(flushing).resolves.toEqual({ status: "closed" });
        expect(allSyncs()).toEqual([]);
    });

    it("waits for queued work and reports unavailable when the webview cannot flush", async () => {
        const editor = host.openEditor("/work/form.form");
        const finishQueuedSync = holdEditorQueue(editor);

        const flushing = pendingEdits.flushIntoDocument(editor.id);
        const tracked = track(flushing);
        webviewReplies(editor, "unavailable");
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(tracked.outcome()).toBeUndefined();

        finishQueuedSync();

        await expect(flushing).resolves.toEqual({ status: "unavailable" });
        expect(allSyncs()).toEqual([]);
    });

    it("reports closed when the editor is replaced while the flushed content is synced", async () => {
        const editor = host.openEditor("/work/diagram.bpmn");
        pendingEdits.serve(".bpmn", {
            sync: async () => {
                host.openEditor("/work/diagram.bpmn");
                return true;
            },
        });

        const flushing = pendingEdits.flushIntoDocument(editor.id);
        webviewReplies(editor, "flushed", "<xml/>");

        await expect(flushing).resolves.toEqual({ status: "closed" });
    });

    it("lets the flushed content supersede an earlier sync that missed the document", async () => {
        const editor = host.openEditor("/work/diagram.bpmn", "<v1/>");
        host.store.recordDocumentSync(editor.id, editor, "<missed/>");
        const firstFlush = pendingEdits.flushIntoDocument(editor.id);
        webviewReplies(editor, "flushed", "<v2/>");
        await firstFlush;

        const secondFlush = pendingEdits.flushIntoDocument(editor.id);
        webviewReplies(editor, "clean");

        await expect(secondFlush).resolves.toEqual({ status: "safe", session: editor });
    });

    it("keeps the destructive lock once the flushed content is in the document", async () => {
        const editor = host.openEditor("/work/diagram.bpmn", "<v1/>");

        const flushing = pendingEdits.flushIntoDocument(editor.id, { destructive: true });
        webviewReplies(editor, "flushed", "<v2/>");

        await expect(flushing).resolves.toEqual({ status: "safe", session: editor });
        expect(lastFlushQuery(editor).destructive).toBe(true);
        expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toEqual([]);
    });

    it("releases the destructive lock when the flushed content does not reach the document", async () => {
        const editor = host.openEditor("/work/diagram.bpmn", "<other/>");
        pendingEdits.serve(".bpmn", { sync: async () => false });

        const flushing = pendingEdits.flushIntoDocument(editor.id, { destructive: true });
        const { token } = lastFlushQuery(editor);
        webviewReplies(editor, "flushed", "<stable/>");

        await expect(flushing).resolves.toEqual({ status: "unavailable" });
        expect(editor.posted.at(-1)).toEqual(new ReleaseDocumentFlushQuery(token));
    });

    it("logs, releases the destructive lock and reports unavailable when the sync throws", async () => {
        const editor = host.openEditor("/work/diagram.bpmn");
        const boom = new Error("boom");
        pendingEdits.serve(".bpmn", {
            sync: async () => {
                throw boom;
            },
        });

        const flushing = pendingEdits.flushIntoDocument(editor.id, { destructive: true });
        const { token } = lastFlushQuery(editor);
        webviewReplies(editor, "flushed", "<xml/>");

        await expect(flushing).resolves.toEqual({ status: "unavailable" });
        expect(host.notifier.logged("error")).toEqual([boom.stack]);
        expect(editor.posted.at(-1)).toEqual(new ReleaseDocumentFlushQuery(token));
    });

    it.each<[string, (editor: FakeEditorHandle) => void]>([
        ["the webview cannot flush", (editor) => webviewReplies(editor, "unavailable")],
        [
            "the latest normal sync missed the document",
            (editor) => {
                host.store.recordDocumentSync(editor.id, editor, "<missed/>");
                webviewReplies(editor, "clean");
            },
        ],
        [
            "the flushed content does not reach the document",
            (editor) => {
                modelers[".bpmn"].sync = async () => false;
                webviewReplies(editor, "flushed", "<v3/>");
            },
        ],
        [
            "the sync throws",
            (editor) => {
                modelers[".bpmn"].sync = async () => {
                    throw new Error("boom");
                };
                webviewReplies(editor, "flushed", "<v3/>");
            },
        ],
    ])(
        "leaves a held destructive lock alone when a normal flush fails because %s",
        async (_reason, failTheFlush) => {
            const editor = host.openEditor("/work/diagram.bpmn", "<v1/>");
            const destructiveFlush = pendingEdits.flushIntoDocument(editor.id, {
                destructive: true,
            });
            const { token } = lastFlushQuery(editor);
            webviewReplies(editor, "flushed", "<v2/>");
            await destructiveFlush;

            const normalFlush = pendingEdits.flushIntoDocument(editor.id);
            failTheFlush(editor);

            await expect(normalFlush).resolves.toEqual({ status: "unavailable" });
            expect(editor.postedOfType("ReleaseDocumentFlushQuery")).toEqual([]);
            pendingEdits.release(editor.id, editor);
            expect(editor.posted.at(-1)).toEqual(new ReleaseDocumentFlushQuery(token));
        },
    );

    it("releases a held destructive lock on request", async () => {
        const editor = host.openEditor("/work/diagram.bpmn", "<v1/>");
        const flushing = pendingEdits.flushIntoDocument(editor.id, { destructive: true });
        const { token } = lastFlushQuery(editor);
        webviewReplies(editor, "flushed", "<v2/>");
        await flushing;

        pendingEdits.release(editor.id, editor);

        expect(editor.posted.at(-1)).toEqual(new ReleaseDocumentFlushQuery(token));
    });
});
