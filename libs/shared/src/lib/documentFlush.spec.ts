import { describe, expect, it, vi } from "vitest";

import { createFlushResponder, FlushSource } from "./documentFlush";
import { DocumentFlushedCommand, FlushDocumentQuery, ReleaseDocumentFlushQuery } from "./messages";

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
            isEditedSinceHostImport: () => true,
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
        const source = {
            ...makeSource({ isReady: () => false, exportContent }),
            cancelPendingSync,
        };
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(1));

        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(1, undefined, "unavailable"));
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

        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(2, undefined, "clean", 0));
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
            new DocumentFlushedCommand(4, undefined, "host-updated", 0),
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
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(5, undefined, "unavailable"));
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
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(6, "<stable/>", "flushed", 0));

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
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(7, undefined, "clean", 0));
        expect(source.endDestructiveFlush).not.toHaveBeenCalled();

        await respond(new ReleaseDocumentFlushQuery(7));
        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();
    });

    it("exports for a destructive host that cannot drain an already-posted sync", async () => {
        const source = makeSource({
            hasPendingSync: () => false,
            isEditedSinceHostImport: () => true,
        });
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(8, true, true));

        expect(source.flushPendingSync).toHaveBeenCalledOnce();
        expect(source.exportContent).toHaveBeenCalledOnce();
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(8, "<xml/>", "flushed", 0));
    });

    it("leaves a page nobody edited since its last host import to that host", async () => {
        const source = makeSource({
            hasPendingSync: () => false,
            isEditedSinceHostImport: () => false,
        });
        const post = vi.fn();
        const respond = createFlushResponder(source, post);

        await respond(new FlushDocumentQuery(8, true, true));

        expect(source.beginDestructiveFlush).toHaveBeenCalledOnce();
        expect(source.flushPendingSync).not.toHaveBeenCalled();
        expect(source.exportContent).not.toHaveBeenCalled();
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(8, undefined, "clean", 0));
        expect(source.endDestructiveFlush).not.toHaveBeenCalled();
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
            new DocumentFlushedCommand(9, undefined, "host-updated", 0),
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
            new DocumentFlushedCommand(10, undefined, "host-updated", 0),
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
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(11, undefined, "unavailable"));
    });

    it("keeps the lock when a release names another flush", async () => {
        const source = makeSource();
        const respond = createFlushResponder(source, vi.fn());

        await respond(new FlushDocumentQuery(12, true));
        await respond(new ReleaseDocumentFlushQuery(11));
        expect(source.endDestructiveFlush).not.toHaveBeenCalled();

        await respond(new ReleaseDocumentFlushQuery(12));
        await respond(new ReleaseDocumentFlushQuery(12));
        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();
    });

    it("hands the lock to a newer destructive flush and ignores the older release", async () => {
        const source = makeSource();
        const respond = createFlushResponder(source, vi.fn());

        await respond(new FlushDocumentQuery(13, true));
        await respond(new FlushDocumentQuery(14, true));
        expect(source.beginDestructiveFlush).toHaveBeenCalledTimes(2);
        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();

        await respond(new ReleaseDocumentFlushQuery(13));
        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();

        await respond(new ReleaseDocumentFlushQuery(14));
        expect(source.endDestructiveFlush).toHaveBeenCalledTimes(2);
    });

    it("does not release a newer flush's lock when an older destructive export fails", async () => {
        let failOlderExport!: (error: Error) => void;
        const source = makeSource({
            exportContent: vi
                .fn()
                .mockImplementationOnce(
                    () => new Promise<string>((_, reject) => (failOlderExport = reject)),
                )
                .mockResolvedValue("<newer/>"),
        });
        const post = vi.fn();
        const respond = createFlushResponder(source, post);

        const older = respond(new FlushDocumentQuery(15, true));
        await vi.waitFor(() => expect(source.exportContent).toHaveBeenCalledOnce());
        await respond(new FlushDocumentQuery(16, true));
        failOlderExport(new Error("no diagram"));
        await older;

        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(16, "<newer/>", "flushed", 0));
        expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(15, undefined, "unavailable"));
        expect(source.endDestructiveFlush).toHaveBeenCalledOnce();

        await respond(new ReleaseDocumentFlushQuery(16));
        expect(source.endDestructiveFlush).toHaveBeenCalledTimes(2);
    });

    function hostUpdateArrivingDuring(
        step: "flushPendingSync" | "exportContent",
        exportFails = false,
    ): Partial<FlushSource> {
        let version = 0;
        const arrive = (): void => void version++;
        return step === "flushPendingSync"
            ? { hostUpdateVersion: () => version, flushPendingSync: vi.fn(async () => arrive()) }
            : {
                  hostUpdateVersion: () => version,
                  exportContent: vi.fn(async () => {
                      arrive();
                      if (exportFails) throw new Error("no diagram");
                      return "<stale/>";
                  }),
              };
    }

    it.each<{
        reply: "clean" | "host-updated";
        when: string;
        query: FlushDocumentQuery;
        overrides: () => Partial<FlushSource>;
    }>([
        {
            reply: "clean",
            when: "nothing is pending",
            query: new FlushDocumentQuery(20),
            overrides: () => ({ hasPendingSync: () => false }),
        },
        {
            reply: "host-updated",
            when: "a host update is importing",
            query: new FlushDocumentQuery(20),
            overrides: () => ({ hasPendingHostUpdate: () => true }),
        },
        {
            reply: "clean",
            when: "a destructive flush finds no edit",
            query: new FlushDocumentQuery(20, true),
            overrides: () => ({ hasPendingSync: () => false }),
        },
        {
            reply: "host-updated",
            when: "a destructive flush meets an importing host update",
            query: new FlushDocumentQuery(20, true),
            overrides: () => ({ hasPendingHostUpdate: () => true }),
        },
        {
            reply: "host-updated",
            when: "a host update arrives while a destructive flush drains its sync",
            query: new FlushDocumentQuery(20, true),
            overrides: () => hostUpdateArrivingDuring("flushPendingSync"),
        },
        {
            reply: "host-updated",
            when: "a host update arrives while the export awaits",
            query: new FlushDocumentQuery(20),
            overrides: () => hostUpdateArrivingDuring("exportContent"),
        },
        {
            reply: "host-updated",
            when: "a host update arrives before the export fails",
            query: new FlushDocumentQuery(20),
            overrides: () => hostUpdateArrivingDuring("exportContent", true),
        },
    ])(
        "names the document revision it represents in a $reply reply when $when",
        async ({ reply, query, overrides }) => {
            const source = makeSource({ ...overrides(), documentRevision: () => 4 });
            const post = vi.fn();

            await createFlushResponder(source, post)(query);

            expect(post).toHaveBeenCalledWith(new DocumentFlushedCommand(20, undefined, reply, 4));
        },
    );

    it("echoes the query token verbatim", async () => {
        const source = makeSource();
        const post = vi.fn();

        await createFlushResponder(source, post)(new FlushDocumentQuery(99));

        expect(post.mock.calls[0][0].token).toBe(99);
    });
});
