import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import { commitActiveEditor, createFlushResponder, FlushSource } from "./documentFlush";
import { FlushDocumentQuery } from "./messages";

const flushedCommandFixture = JSON.parse(
    readFileSync(
        new URL("../../test-fixtures/document-flushed-command.json", import.meta.url),
        "utf8",
    ),
) as unknown;

/**
 * Covers the webview-side flush responder — the piece both the BPMN and (untested
 * on its own) DMN webviews delegate to. Each test stubs a {@link FlushSource} and
 * captures the posted reply.
 */
describe("createFlushResponder", () => {
    function makeSource(overrides: Partial<FlushSource> = {}): FlushSource {
        return {
            isReady: () => true,
            prepareFlush: vi.fn().mockResolvedValue(undefined),
            hasPendingSync: () => true,
            exportXml: vi.fn().mockResolvedValue("<xml/>"),
            ...overrides,
        };
    }

    it("replies undefined without exporting when not ready", async () => {
        const exportXml = vi.fn().mockResolvedValue("<xml/>");
        const source = makeSource({ isReady: () => false, exportXml });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(1));

        expect(post).toHaveBeenCalledWith(
            expect.objectContaining({ token: 1, result: { status: "idle" } }),
        );
        expect(exportXml).not.toHaveBeenCalled();
    });

    it("replies undefined without exporting when nothing is pending", async () => {
        const exportXml = vi.fn().mockResolvedValue("<xml/>");
        const source = makeSource({ hasPendingSync: () => false, exportXml });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(2));

        expect(post).toHaveBeenCalledWith(
            expect.objectContaining({ token: 2, result: { status: "idle" } }),
        );
        expect(exportXml).not.toHaveBeenCalled();
    });

    it("exports and posts the pending XML", async () => {
        const exportXml = vi.fn(async () => {
            return "<xml/>";
        });
        const source = makeSource({ exportXml });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(3));

        expect(JSON.parse(JSON.stringify(post.mock.calls[0][0]))).toEqual(flushedCommandFixture);
    });

    it("commits the active editor before checking for pending sync", async () => {
        let pending = false;
        const prepareFlush = vi.fn(async () => {
            pending = true;
        });
        const exportXml = vi.fn().mockResolvedValue("<xml/>");
        const source = {
            ...makeSource({ hasPendingSync: () => pending, exportXml }),
            prepareFlush,
        };
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(4));

        expect(prepareFlush).toHaveBeenCalledOnce();
        expect(exportXml).toHaveBeenCalledOnce();
        expect(post).toHaveBeenCalledWith(
            expect.objectContaining({ token: 4, result: { status: "flushed", content: "<xml/>" } }),
        );
    });

    it("replies undefined when the export throws (e.g. empty DMN diagram)", async () => {
        const source = makeSource({
            exportXml: vi.fn().mockRejectedValue(new Error("no diagram")),
        });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(5));

        expect(post).toHaveBeenCalledWith(
            expect.objectContaining({ token: 5, result: { status: "failed" } }),
        );
    });

    it("echoes the query token verbatim", async () => {
        const source = makeSource();
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(99));

        expect(post.mock.calls[0][0].token).toBe(99);
    });
});

describe("commitActiveEditor", () => {
    it("blurs an editable element and waits for its commit task", async () => {
        let committed = false;
        const blur = vi.fn(() => {
            setTimeout(() => {
                committed = true;
            }, 0);
        });
        const document = {
            activeElement: {
                matches: () => true,
                blur,
            },
        } as unknown as Document;

        await commitActiveEditor(document);

        expect(blur).toHaveBeenCalledOnce();
        expect(committed).toBe(true);
    });

    it("leaves non-editable focus unchanged", async () => {
        const blur = vi.fn();
        const document = {
            activeElement: {
                matches: () => false,
                blur,
            },
        } as unknown as Document;

        await commitActiveEditor(document);

        expect(blur).not.toHaveBeenCalled();
    });
});
