import { describe, expect, it, vi } from "vitest";

import { createFlushResponder, FlushSource } from "./documentFlush";
import { DocumentFlushedCommand, FlushDocumentQuery } from "./messages";

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
            cancelPendingSync: vi.fn(),
            exportXml: vi.fn().mockResolvedValue("<xml/>"),
            ...overrides,
        };
    }

    it("replies undefined without exporting when not ready", async () => {
        const exportXml = vi.fn().mockResolvedValue("<xml/>");
        const cancelPendingSync = vi.fn();
        const source = makeSource({ isReady: () => false, exportXml, cancelPendingSync });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(1));

        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(1, undefined));
        expect(exportXml).not.toHaveBeenCalled();
        expect(cancelPendingSync).not.toHaveBeenCalled();
    });

    it("replies undefined without exporting when nothing is pending", async () => {
        const exportXml = vi.fn().mockResolvedValue("<xml/>");
        const cancelPendingSync = vi.fn();
        const source = makeSource({ hasPendingSync: () => false, exportXml, cancelPendingSync });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(2));

        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(2, undefined));
        expect(exportXml).not.toHaveBeenCalled();
        expect(cancelPendingSync).not.toHaveBeenCalled();
    });

    it("cancels the pending sync, then exports, then posts the XML", async () => {
        const order: string[] = [];
        const cancelPendingSync = vi.fn(() => void order.push("cancel"));
        const exportXml = vi.fn(async () => {
            order.push("export");
            return "<xml/>";
        });
        const source = makeSource({ cancelPendingSync, exportXml });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(3));

        expect(order).toEqual(["cancel", "export"]);
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(3, "<xml/>"));
    });

    it("replies undefined when the export throws (e.g. empty DMN diagram)", async () => {
        const source = makeSource({
            exportXml: vi.fn().mockRejectedValue(new Error("no diagram")),
        });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(4));

        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(4, undefined));
    });

    it("echoes the query token verbatim", async () => {
        const source = makeSource();
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(99));

        expect(post.mock.calls[0][0].token).toBe(99);
    });
});
