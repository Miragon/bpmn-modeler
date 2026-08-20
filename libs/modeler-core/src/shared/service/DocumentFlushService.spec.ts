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

    function reply(
        editorId: string,
        result: DocumentFlushedCommand["result"],
        token = tokenFor(editorId),
    ): void {
        svc.handleReply({ token, result } as DocumentFlushedCommand, editorId);
    }

    it("resolves with the result of a matching reply", async () => {
        const promise = svc.requestFlush("e1");
        reply("e1", { status: "flushed", content: "<xml/>" });

        await expect(promise).resolves.toEqual({ status: "flushed", content: "<xml/>" });
    });

    it("ignores a mismatched-token reply and then times out as failed", async () => {
        const promise = svc.requestFlush("e1", 500);

        reply("e1", { status: "flushed", content: "<stale/>" }, 9999);
        expect(notifier.logDebug).toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toEqual({ status: "failed" });
    });

    it("times out as failed and treats a late matching reply as a no-op", async () => {
        const promise = svc.requestFlush("e1", 500);
        const token = tokenFor("e1");

        await vi.advanceTimersByTimeAsync(500);
        await expect(promise).resolves.toEqual({ status: "failed" });

        // Late reply after the timeout must not throw.
        expect(() => reply("e1", { status: "flushed", content: "<late/>" }, token)).not.toThrow();
    });

    it("resolves failed when the post rejects (hidden webview)", async () => {
        postMessage.mockReturnValueOnce(Promise.reject(new Error("The active editor is hidden.")));

        await expect(svc.requestFlush("e1")).resolves.toEqual({ status: "failed" });
    });

    it("supersedes an earlier request for the same editor, resolving it failed", async () => {
        const first = svc.requestFlush("e1");
        const second = svc.requestFlush("e1");

        await expect(first).resolves.toEqual({ status: "failed" });

        reply("e1", { status: "flushed", content: "<second/>" }, tokenFor("e1", 1));
        await expect(second).resolves.toEqual({ status: "flushed", content: "<second/>" });
    });

    it("keeps requests for different editors independent", async () => {
        const a = svc.requestFlush("a");
        const b = svc.requestFlush("b");

        reply("a", { status: "flushed", content: "<a/>" });
        await expect(a).resolves.toEqual({ status: "flushed", content: "<a/>" });

        reply("b", { status: "idle" });
        await expect(b).resolves.toEqual({ status: "idle" });
    });
});
