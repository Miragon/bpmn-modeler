import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    DocumentFlushedCommand,
    FlushDocumentQuery,
    ReleaseDocumentFlushQuery,
} from "@miragon/bpmn-modeler-shared";

import { createTestHost, FakeEditorHandle, TestHost } from "../../testing";
import { DocumentFlushService } from "./DocumentFlushService";

const E1 = "file:///w/e1.bpmn";

/**
 * Drives the host-side flush round-trip against a real store. Fake timers make
 * the 500ms timeout deterministic; the {@link FlushDocumentQuery} tokens an
 * editor received are read back so replies can be matched the way a real
 * webview would.
 */
describe("DocumentFlushService", () => {
    let host: TestHost;
    let editor: FakeEditorHandle;
    let svc: DocumentFlushService;

    beforeEach(() => {
        vi.useFakeTimers();
        host = createTestHost();
        editor = host.openEditor("/w/e1.bpmn");
        svc = new DocumentFlushService(host.store, host.notifier);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Token of the nth FlushDocumentQuery posted to `handle`. */
    function tokenFor(handle: FakeEditorHandle, index = 0): number {
        return handle.postedOfType<FlushDocumentQuery>("FlushDocumentQuery")[index].token;
    }

    it("resolves with the content of a matching reply", async () => {
        const promise = svc.requestFlush(E1);
        svc.handleReply(new DocumentFlushedCommand(tokenFor(editor), "<xml/>"), E1);

        await expect(promise).resolves.toEqual({ status: "flushed", content: "<xml/>" });
    });

    it("preserves the document revision of flushed content", async () => {
        const promise = svc.requestFlush(E1);
        svc.handleReply(new DocumentFlushedCommand(tokenFor(editor), "<xml/>", "flushed", 3), E1);

        await expect(promise).resolves.toEqual({
            status: "flushed",
            content: "<xml/>",
            documentRevision: 3,
        });
    });

    it("distinguishes a confirmed clean reply from an unavailable webview", async () => {
        const promise = svc.requestFlush(E1);
        svc.handleReply(new DocumentFlushedCommand(tokenFor(editor)), E1);

        await expect(promise).resolves.toEqual({ status: "clean" });
    });

    it("preserves an authoritative host-update reply", async () => {
        const promise = svc.requestFlush(E1);
        svc.handleReply(
            new DocumentFlushedCommand(tokenFor(editor), undefined, "host-updated"),
            E1,
        );

        await expect(promise).resolves.toEqual({ status: "host-updated" });
    });

    it("ignores a mismatched-token reply and then reports unavailable", async () => {
        const promise = svc.requestFlush(E1, { timeoutMs: 500 });

        svc.handleReply(new DocumentFlushedCommand(9999, "<stale/>"), E1);
        expect(host.notifier.logged("debug")).toEqual([
            `Ignoring stale DocumentFlushedCommand (token 9999) for ${E1}`,
        ]);

        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toEqual({ status: "unavailable" });
    });

    it("reports unavailable on timeout and treats a late matching reply as a no-op", async () => {
        const promise = svc.requestFlush(E1, { timeoutMs: 500 });
        const token = tokenFor(editor);

        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toEqual({ status: "unavailable" });

        // Late reply after the timeout must not throw.
        expect(() =>
            svc.handleReply(new DocumentFlushedCommand(token, "<late/>"), E1),
        ).not.toThrow();
    });

    it("releases a destructive webview lock after timeout", async () => {
        const promise = svc.requestFlush(E1, { timeoutMs: 500, destructive: true });
        const token = tokenFor(editor);

        await vi.advanceTimersByTimeAsync(500);

        await expect(promise).resolves.toEqual({ status: "unavailable" });
        expect(editor.posted.at(-1)).toEqual(new ReleaseDocumentFlushQuery(token));
    });

    it("reports unavailable when the post rejects (hidden webview)", async () => {
        editor.hidden = true;

        await expect(svc.requestFlush(E1)).resolves.toEqual({ status: "unavailable" });
    });

    it("reports unavailable when the webview does not receive the query", async () => {
        vi.spyOn(editor, "postMessage").mockResolvedValueOnce(false);

        await expect(svc.requestFlush(E1)).resolves.toEqual({ status: "unavailable" });
    });

    it("resolves an explicit unavailable reply without waiting for timeout", async () => {
        const promise = svc.requestFlush(E1, { timeoutMs: 500 });
        svc.handleReply(new DocumentFlushedCommand(tokenFor(editor), undefined, "unavailable"), E1);

        await expect(promise).resolves.toEqual({ status: "unavailable" });
        expect(vi.getTimerCount()).toBe(0);
    });

    it("reports unavailable when there is no current editor session", async () => {
        host.store.unregister(editor.id, editor);

        await expect(svc.requestFlush(E1)).resolves.toEqual({ status: "unavailable" });
        expect(editor.posted).toEqual([]);
    });

    it("reports unavailable when posting throws synchronously", async () => {
        vi.spyOn(editor, "postMessage").mockImplementationOnce(() => {
            throw new Error("disposed");
        });

        await expect(svc.requestFlush(E1)).resolves.toEqual({ status: "unavailable" });
    });

    it("coalesces concurrent requests for the same editor", async () => {
        const first = svc.requestFlush(E1);
        const second = svc.requestFlush(E1);

        expect(second).toBe(first);
        expect(editor.posted).toHaveLength(1);

        svc.handleReply(new DocumentFlushedCommand(tokenFor(editor), "<shared/>"), E1);
        await expect(first).resolves.toEqual({ status: "flushed", content: "<shared/>" });
        await expect(second).resolves.toEqual({ status: "flushed", content: "<shared/>" });
    });

    it("supersedes a normal request when a destructive flush needs a lock", async () => {
        const first = svc.requestFlush(E1);
        const second = svc.requestFlush(E1, { destructive: true });

        await expect(first).resolves.toEqual({ status: "unavailable" });
        expect(editor.posted).toHaveLength(2);
        expect(editor.posted[1]).toEqual(expect.objectContaining({ destructive: true }));

        svc.handleReply(new DocumentFlushedCommand(tokenFor(editor, 1), "<stable/>"), E1);
        await expect(second).resolves.toEqual({ status: "flushed", content: "<stable/>" });
    });

    it("lets a normal caller share an in-flight destructive flush", async () => {
        const destructive = svc.requestFlush(E1, { destructive: true });
        const normal = svc.requestFlush(E1);

        expect(normal).toBe(destructive);
        expect(editor.posted).toHaveLength(1);

        svc.handleReply(new DocumentFlushedCommand(tokenFor(editor), "<stable/>"), E1);
        await expect(normal).resolves.toEqual({ status: "flushed", content: "<stable/>" });
    });

    it("releases a successful destructive flush for the same editor session", async () => {
        const result = svc.requestFlush(E1, { destructive: true });
        const token = tokenFor(editor);
        svc.handleReply(new DocumentFlushedCommand(token, "<stable/>"), E1);
        await result;

        svc.releaseFlush(E1, editor);

        expect(editor.posted.at(-1)).toEqual(new ReleaseDocumentFlushQuery(token));
    });

    it("does not coalesce requests across replacement editor sessions", async () => {
        const first = svc.requestFlush(E1);
        const replacement = host.openEditor("/w/e1.bpmn");
        const second = svc.requestFlush(E1);

        await expect(first).resolves.toEqual({ status: "unavailable" });
        expect(editor.posted).toHaveLength(1);
        expect(replacement.posted).toHaveLength(1);

        svc.handleReply(new DocumentFlushedCommand(tokenFor(editor), "<stale/>"), E1);
        svc.handleReply(new DocumentFlushedCommand(tokenFor(replacement), "<replacement/>"), E1);
        await expect(second).resolves.toEqual({
            status: "flushed",
            content: "<replacement/>",
        });
    });

    it("keeps requests for different editors independent", async () => {
        const editorA = host.openEditor("/w/a.bpmn");
        const editorB = host.openEditor("/w/b.bpmn");
        const a = svc.requestFlush(editorA.id);
        const b = svc.requestFlush(editorB.id);

        svc.handleReply(new DocumentFlushedCommand(tokenFor(editorA), "<a/>"), editorA.id);
        await expect(a).resolves.toEqual({ status: "flushed", content: "<a/>" });

        svc.handleReply(new DocumentFlushedCommand(tokenFor(editorB), "<b/>"), editorB.id);
        await expect(b).resolves.toEqual({ status: "flushed", content: "<b/>" });
    });
});
