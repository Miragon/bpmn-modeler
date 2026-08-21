import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentFlushedCommand, FlushDocumentQuery } from "@miragon/bpmn-modeler-shared";

import { DocumentFlushService } from "./DocumentFlushService";
import { NotifierPort } from "../domain/hostPorts";
import { EditorSessionStore } from "../infrastructure/EditorSessionStore";

/**
 * Drives the host-side flush round-trip against a stub store. Fake timers make
 * the 500ms timeout deterministic; the posted {@link FlushDocumentQuery} tokens
 * are captured so replies can be matched the way a real webview would.
 */
describe("DocumentFlushService", () => {
    let posted: { editorId: string; query: FlushDocumentQuery }[];
    let postMessage: ReturnType<typeof vi.fn>;
    let store: EditorSessionStore;
    let notifier: NotifierPort;
    let svc: DocumentFlushService;

    beforeEach(() => {
        vi.useFakeTimers();
        posted = [];
        postMessage = vi.fn((editorId: string, query: FlushDocumentQuery) => {
            posted.push({ editorId, query });
            return Promise.resolve(true);
        });
        store = { postMessage } as unknown as EditorSessionStore;
        notifier = { logDebug: vi.fn() } as unknown as NotifierPort;
        svc = new DocumentFlushService(store, notifier);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    /** Token of the nth FlushDocumentQuery posted for `editorId`. */
    function tokenFor(editorId: string, index = 0): number {
        return posted.filter((p) => p.editorId === editorId)[index].query.token;
    }

    it("resolves with the content of a matching reply", async () => {
        const promise = svc.requestFlush("e1");
        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1"), "<xml/>"), "e1");

        await expect(promise).resolves.toBe("<xml/>");
    });

    it("ignores a mismatched-token reply and then times out to undefined", async () => {
        const promise = svc.requestFlush("e1", 500);

        svc.handleReply(new DocumentFlushedCommand(9999, "<stale/>"), "e1");
        expect(notifier.logDebug).toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toBeUndefined();
    });

    it("times out to undefined and treats a late matching reply as a no-op", async () => {
        const promise = svc.requestFlush("e1", 500);
        const token = tokenFor("e1");

        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toBeUndefined();

        // Late reply after the timeout must not throw.
        expect(() =>
            svc.handleReply(new DocumentFlushedCommand(token, "<late/>"), "e1"),
        ).not.toThrow();
    });

    it("resolves undefined when the post rejects (hidden webview)", async () => {
        postMessage.mockReturnValueOnce(Promise.reject(new Error("The active editor is hidden.")));

        await expect(svc.requestFlush("e1")).resolves.toBeUndefined();
    });

    it("supersedes an earlier request for the same editor, resolving it undefined", async () => {
        const first = svc.requestFlush("e1");
        const second = svc.requestFlush("e1");

        await expect(first).resolves.toBeUndefined();

        svc.handleReply(new DocumentFlushedCommand(tokenFor("e1", 1), "<second/>"), "e1");
        await expect(second).resolves.toBe("<second/>");
    });

    it("keeps requests for different editors independent", async () => {
        const a = svc.requestFlush("a");
        const b = svc.requestFlush("b");

        svc.handleReply(new DocumentFlushedCommand(tokenFor("a"), "<a/>"), "a");
        await expect(a).resolves.toBe("<a/>");

        svc.handleReply(new DocumentFlushedCommand(tokenFor("b"), "<b/>"), "b");
        await expect(b).resolves.toBe("<b/>");
    });
});
