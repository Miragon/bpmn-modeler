import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DocumentFlushedCommand,
    FlushDocumentQuery,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";

import { DocumentFlushService } from "./DocumentFlushService";
import { NotifierPort } from "../domain/hostPorts";
import { EditorSessionStore } from "../infrastructure/EditorSessionStore";

/**
 * Drives the host-side flush round-trip against a stub store. Fake timers make
 * the 500ms timeout deterministic; the posted {@link FlushDocumentQuery} tokens
 * are captured so replies can be matched the way a real webview would.
 */
describe("DocumentFlushService", () => {
    let posted: { editorId: string; query: FlushDocumentQuery | ReleaseDocumentFlushQuery }[];
    let postMessage: ReturnType<typeof vi.fn>;
    let store: EditorSessionStore;
    let notifier: NotifierPort;
    let svc: DocumentFlushService;
    let session: object;

    beforeEach(() => {
        vi.useFakeTimers();
        posted = [];
        postMessage = vi.fn(
            (editorId: string, query: FlushDocumentQuery | ReleaseDocumentFlushQuery) => {
                posted.push({ editorId, query });
                return Promise.resolve(true);
            },
        );
        session = {};
        store = {
            postMessage,
            captureEditorSession: vi.fn(() => session),
            isCurrentEditorSession: vi.fn(
                (_editorId: string, expected: object) => expected === session,
            ),
        } as unknown as EditorSessionStore;
        notifier = { logDebug: vi.fn() } as unknown as NotifierPort;
        svc = new DocumentFlushService(store, notifier);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Token of the nth FlushDocumentQuery posted for `editorId`. */
    function tokenFor(editorId: string, index = 0): number {
        return posted.filter(
            (p) => p.editorId === editorId && p.query.type === "FlushDocumentQuery",
        )[index].query.token;
    }

    it("resolves with the content of a matching reply", async () => {
        const promise = svc.requestFlush("e1");
        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1"), "<xml/>"), "e1");

        await expect(promise).resolves.toEqual({ status: "flushed", content: "<xml/>" });
    });

    it("preserves the document revision of flushed content", async () => {
        const promise = svc.requestFlush("e1");
        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1"), "<xml/>", "flushed", 3), "e1");

        await expect(promise).resolves.toEqual({
            status: "flushed",
            content: "<xml/>",
            documentRevision: 3,
        });
    });

    it("distinguishes a confirmed clean reply from an unavailable webview", async () => {
        const promise = svc.requestFlush("e1");
        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1")), "e1");

        await expect(promise).resolves.toEqual({ status: "clean" });
    });

    it("preserves an authoritative host-update reply", async () => {
        const promise = svc.requestFlush("e1");
        svc.handleReply(
            new DocumentFlushedCommand(tokenFor("e1"), undefined, "host-updated"),
            "e1",
        );

        await expect(promise).resolves.toEqual({ status: "host-updated" });
    });

    it("ignores a mismatched-token reply and then reports unavailable", async () => {
        const promise = svc.requestFlush("e1", { timeoutMs: 500 });

        svc.handleReply(new DocumentFlushedCommand(9999, "<stale/>"), "e1");
        expect(notifier.logDebug).toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toEqual({ status: "unavailable" });
    });

    it("reports unavailable on timeout and treats a late matching reply as a no-op", async () => {
        const promise = svc.requestFlush("e1", { timeoutMs: 500 });
        const token = tokenFor("e1");

        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toEqual({ status: "unavailable" });

        // Late reply after the timeout must not throw.
        expect(() =>
            svc.handleReply(new DocumentFlushedCommand(token, "<late/>"), "e1"),
        ).not.toThrow();
    });

    it("releases a destructive webview lock after timeout", async () => {
        const promise = svc.requestFlush("e1", { timeoutMs: 500, destructive: true });
        const token = tokenFor("e1");

        await vi.advanceTimersByTimeAsync(500);

        await expect(promise).resolves.toEqual({ status: "unavailable" });
        expect(posted.at(-1)?.query).toEqual(new ReleaseDocumentFlushQuery(token));
    });

    it("reports unavailable when the post rejects (hidden webview)", async () => {
        postMessage.mockReturnValueOnce(Promise.reject(new Error("The active editor is hidden.")));

        await expect(svc.requestFlush("e1")).resolves.toEqual({ status: "unavailable" });
    });

    it("reports unavailable when the webview does not receive the query", async () => {
        postMessage.mockReturnValueOnce(Promise.resolve(false));

        await expect(svc.requestFlush("e1")).resolves.toEqual({ status: "unavailable" });
    });

    it("resolves an explicit unavailable reply without waiting for timeout", async () => {
        const promise = svc.requestFlush("e1", { timeoutMs: 500 });
        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1"), undefined, "unavailable"), "e1");

        await expect(promise).resolves.toEqual({ status: "unavailable" });
        expect(vi.getTimerCount()).toBe(0);
    });

    it("reports unavailable when there is no current editor session", async () => {
        vi.mocked(store.captureEditorSession).mockReturnValueOnce(undefined);

        await expect(svc.requestFlush("e1")).resolves.toEqual({ status: "unavailable" });
        expect(postMessage).not.toHaveBeenCalled();
    });

    it("reports unavailable when posting throws synchronously", async () => {
        postMessage.mockImplementationOnce(() => {
            throw new Error("disposed");
        });

        await expect(svc.requestFlush("e1")).resolves.toEqual({ status: "unavailable" });
    });

    it("coalesces concurrent requests for the same editor", async () => {
        const first = svc.requestFlush("e1");
        const second = svc.requestFlush("e1");

        expect(second).toBe(first);
        expect(postMessage).toHaveBeenCalledOnce();

        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1"), "<shared/>"), "e1");
        await expect(first).resolves.toEqual({ status: "flushed", content: "<shared/>" });
        await expect(second).resolves.toEqual({ status: "flushed", content: "<shared/>" });
    });

    it("supersedes a normal request when a destructive flush needs a lock", async () => {
        const first = svc.requestFlush("e1");
        const second = svc.requestFlush("e1", { destructive: true });

        await expect(first).resolves.toEqual({ status: "unavailable" });
        expect(postMessage).toHaveBeenCalledTimes(2);
        expect(posted[1].query).toEqual(expect.objectContaining({ destructive: true }));

        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1", 1), "<stable/>"), "e1");
        await expect(second).resolves.toEqual({ status: "flushed", content: "<stable/>" });
    });

    it("lets a normal caller share an in-flight destructive flush", async () => {
        const destructive = svc.requestFlush("e1", { destructive: true });
        const normal = svc.requestFlush("e1");

        expect(normal).toBe(destructive);
        expect(postMessage).toHaveBeenCalledOnce();

        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1"), "<stable/>"), "e1");
        await expect(normal).resolves.toEqual({ status: "flushed", content: "<stable/>" });
    });

    it("releases a successful destructive flush for the same editor session", async () => {
        const result = svc.requestFlush("e1", { destructive: true });
        const token = tokenFor("e1");
        svc.handleReply(new DocumentFlushedCommand(token, "<stable/>"), "e1");
        await result;

        svc.releaseFlush("e1", session);

        expect(posted.at(-1)?.query).toEqual(new ReleaseDocumentFlushQuery(token));
    });

    it("does not coalesce requests across replacement editor sessions", async () => {
        const first = svc.requestFlush("e1");
        session = {};
        const second = svc.requestFlush("e1");

        await expect(first).resolves.toEqual({ status: "unavailable" });
        expect(postMessage).toHaveBeenCalledTimes(2);

        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1"), "<stale/>"), "e1");
        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1", 1), "<replacement/>"), "e1");
        await expect(second).resolves.toEqual({
            status: "flushed",
            content: "<replacement/>",
        });
    });

    it("keeps requests for different editors independent", async () => {
        const a = svc.requestFlush("a");
        const b = svc.requestFlush("b");

        svc.handleReply(new DocumentFlushedCommand(tokenFor("a"), "<a/>"), "a");
        await expect(a).resolves.toEqual({ status: "flushed", content: "<a/>" });

        svc.handleReply(new DocumentFlushedCommand(tokenFor("b"), "<b/>"), "b");
        await expect(b).resolves.toEqual({ status: "flushed", content: "<b/>" });
    });
});
