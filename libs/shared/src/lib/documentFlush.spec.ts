import { describe, expect, it, vi } from "vitest";

import { createFlushResponder, FlushSource } from "./documentFlush";
import {
    DocumentFlushedCommand,
    FlushDocumentQuery,
    ReleaseDocumentFlushQuery,
} from "./messages";

/**
 * Covers the webview-side flush responder — the piece both the BPMN and (untested
 * on its own) DMN webviews delegate to. Each test stubs a {@link FlushSource} and
 * captures the posted reply.
 */
describe("createFlushResponder", () => {
    function makeSource(overrides: Partial<FlushSource> = {}): FlushSource {
        return {
            isReady: () => true,
            hasPendingSync: () => true,
            hasPendingHostUpdate: () => false,
            hostUpdateVersion: () => 0,
            documentRevision: () => 0,
            flushPendingSync: vi.fn().mockResolvedValue(undefined),
            beginDestructiveFlush: vi.fn(),
            endDestructiveFlush: vi.fn(),
            exportContent: vi.fn().mockResolvedValue("<xml/>"),
            ...overrides,
        };
    }

    it("reports unavailable immediately when the modeler is not ready", async () => {
        const exportContent = vi.fn().mockResolvedValue("<xml/>");
        const cancelPendingSync = vi.fn();
        const source = { ...makeSource({ isReady: () => false, exportContent }), cancelPendingSync };
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(1));

        expect(post).toHaveBeenCalledWith(
            new DocumentFlushedCommand(1, undefined, "unavailable"),
        );
        expect(exportContent).not.toHaveBeenCalled();
        expect(cancelPendingSync).not.toHaveBeenCalled();
    });

    it("replies undefined without exporting when nothing is pending", async () => {
        const exportContent = vi.fn().mockResolvedValue("<xml/>");
        const cancelPendingSync = vi.fn();
        const source = {
            ...makeSource({ hasPendingSync: () => false, exportContent }),
            cancelPendingSync,
        };
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(2));

        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(2, undefined, "clean"));
        expect(exportContent).not.toHaveBeenCalled();
        expect(cancelPendingSync).not.toHaveBeenCalled();
    });

    it("posts the exported content without cancelling the normal sync fallback", async () => {
        const exportContent = vi.fn(async () => {
            return "<xml/>";
        });
        const cancelPendingSync = vi.fn();
        const source = { ...makeSource({ exportContent }), cancelPendingSync };
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(3));

        expect(cancelPendingSync).not.toHaveBeenCalled();
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(3, "<xml/>", "flushed", 0));
    });

    it("preserves host authority while an inbound update is still importing", async () => {
        const source = makeSource({ hasPendingHostUpdate: () => true });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(4));

        expect(source.exportContent).not.toHaveBeenCalled();
        expect(post).toHaveBeenCalledWith(
            new DocumentFlushedCommand(4, undefined, "host-updated"),
        );
    });

    it("forces the normal sync fallback and reports unavailable when export fails", async () => {
        const cancelPendingSync = vi.fn();
        const flushPendingSync = vi.fn().mockResolvedValue(undefined);
        const source = {
            ...makeSource({
                flushPendingSync,
                exportContent: vi.fn().mockRejectedValue(new Error("no diagram")),
            }),
            cancelPendingSync,
        };
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(5));

        expect(cancelPendingSync).not.toHaveBeenCalled();
        expect(flushPendingSync).toHaveBeenCalledOnce();
        expect(post).toHaveBeenCalledWith(
            new DocumentFlushedCommand(5, undefined, "unavailable"),
        );
    });

    it("locks and drains the webview before exporting a destructive flush", async () => {
        const order: string[] = [];
        const source = makeSource({
            beginDestructiveFlush: vi.fn(() => void order.push("begin")),
            flushPendingSync: vi.fn(async () => void order.push("flush")),
            exportContent: vi.fn(async () => {
                order.push("export");
                return "<stable/>";
            }),
        });
        const post = vi.fn(() => void order.push("post"));
        const respond = createFlushResponder(source, post);

        await respond(new FlushDocumentQuery(6, true));

        expect(order).toEqual(["begin", "flush", "export", "post"]);
        expect(source.endDestructiveFlush).not.toHaveBeenCalled();
        expect(post).toHaveBeenCalledWith(
            new DocumentFlushedCommand(6, "<stable/>", "flushed", 0),
        );

        await respond(new ReleaseDocumentFlushQuery(6));
        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();
    });

    it("locks but preserves host authority when a destructive flush has no pending edit", async () => {
        const source = makeSource({ hasPendingSync: () => false });
        const post = vi.fn();
        const respond = createFlushResponder(source, post);

        await respond(new FlushDocumentQuery(7, true));

        expect(source.beginDestructiveFlush).toHaveBeenCalledOnce();
        expect(source.flushPendingSync).not.toHaveBeenCalled();
        expect(source.exportContent).not.toHaveBeenCalled();
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(7, undefined, "clean"));
        expect(source.endDestructiveFlush).not.toHaveBeenCalled();

        await respond(new ReleaseDocumentFlushQuery(7));
        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();
    });

    it("exports for a destructive host that cannot drain an already-posted sync", async () => {
        const source = makeSource({ hasPendingSync: () => false });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(8, true, true));

        expect(source.flushPendingSync).toHaveBeenCalledOnce();
        expect(source.exportContent).toHaveBeenCalledOnce();
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(8, "<xml/>", "flushed", 0));
    });

    it("does not export a destructive flush over an inbound host update", async () => {
        const source = makeSource({ hasPendingHostUpdate: () => true });
        const post = vi.fn();
        const respond = createFlushResponder(source, post);

        await respond(new FlushDocumentQuery(9, true, true));

        expect(source.beginDestructiveFlush).toHaveBeenCalledOnce();
        expect(source.flushPendingSync).not.toHaveBeenCalled();
        expect(source.exportContent).not.toHaveBeenCalled();
        expect(post).toHaveBeenCalledWith(
            new DocumentFlushedCommand(9, undefined, "host-updated"),
        );

        await respond(new ReleaseDocumentFlushQuery(9));
        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();
    });

    it("discards an export when a host update arrives while it is awaiting", async () => {
        let version = 0;
        let finishExport: (content: string) => void = () => {};
        const source = makeSource({
            hostUpdateVersion: () => version,
            exportContent: vi.fn(
                () =>
                    new Promise<string>((resolve) => {
                        finishExport = resolve;
                    }),
            ),
        });
        const post = vi.fn();
        const responding = createFlushResponder(source, post)(new FlushDocumentQuery(10, true));

        await vi.waitFor(() => expect(source.exportContent).toHaveBeenCalledOnce());
        version++;
        finishExport("<stale/>");
        await responding;

        expect(post).toHaveBeenCalledWith(
            new DocumentFlushedCommand(10, undefined, "host-updated"),
        );
        expect(post).not.toHaveBeenCalledWith(
            new DocumentFlushedCommand(10, "<stale/>", "flushed", 0),
        );
    });

    it("releases a destructive lock when export fails", async () => {
        const source = makeSource({
            exportContent: vi.fn().mockRejectedValue(new Error("no diagram")),
        });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(11, true));

        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();
        expect(post).toHaveBeenCalledWith(
            new DocumentFlushedCommand(11, undefined, "unavailable"),
        );
    });

    it("echoes the query token verbatim", async () => {
        const source = makeSource();
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(99));

        expect(post.mock.calls[0][0].token).toBe(99);
    });
});
