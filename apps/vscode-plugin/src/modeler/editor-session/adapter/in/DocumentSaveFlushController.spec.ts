import { beforeEach, describe, expect, it, vi } from "vitest";

import { DocumentFlushService, PendingEditsFlush } from "@miragon/bpmn-modeler-core";
import { createTestHost, TestHost } from "@miragon/bpmn-modeler-core/testing";
import { DocumentFlushedCommand, FlushDocumentQuery } from "@miragon/bpmn-modeler-shared";

// Only `workspace.onWillSaveTextDocument` is touched at runtime; the hoisted spy
// lets the (hoisted) `vi.mock` factory close over it while keeping it assertable.
const onWillSaveTextDocumentMock = vi.fn();

vi.mock("vscode", () => ({
    workspace: {
        onWillSaveTextDocument: (...args: unknown[]) => onWillSaveTextDocumentMock(...args),
    },
}));

import { DocumentSaveFlushController } from "./DocumentSaveFlushController";

/**
 * Verifies the save hook's routing without a real VS Code host: the captured
 * `onWillSaveTextDocument` listener is fired with a stub event whose `waitUntil`
 * records the promise the controller hands back. The flush itself is covered by
 * the core's `PendingEditsFlush.spec.ts`.
 */
describe("DocumentSaveFlushController", () => {
    let host: TestHost;
    let flushes: DocumentFlushService;
    let listener: (event: unknown) => void;

    beforeEach(() => {
        onWillSaveTextDocumentMock.mockReset();
        host = createTestHost();
        flushes = new DocumentFlushService(host.store, host.notifier);
        const pendingEdits = new PendingEditsFlush(host.store, flushes, host.notifier);
        pendingEdits.serve(".bpmn", {
            sync: (editorId, content) => host.documents.write(editorId, content),
        });

        new DocumentSaveFlushController(host.store, pendingEdits).register({
            subscriptions: [],
        } as never);
        listener = onWillSaveTextDocumentMock.mock.calls[0][0] as (event: unknown) => void;
    });

    /** Fires the save listener and returns the promise handed to `waitUntil`, if any. */
    function fireSave(uri: string): Promise<unknown> | undefined {
        let captured: Promise<unknown> | undefined;
        listener({
            document: { uri: { toString: () => uri } },
            waitUntil: (promise: Promise<unknown>) => {
                captured = promise;
            },
        });
        return captured;
    }

    it("does not call waitUntil for an untracked document", () => {
        expect(fireSave("file:///x.bpmn")).toBeUndefined();
    });

    it("holds the save until the webview's pending edits are in the document", async () => {
        const editor = host.openEditor("/a.bpmn", "<v1/>");

        const saving = fireSave(editor.id);
        const [query] = editor.postedOfType<FlushDocumentQuery>("FlushDocumentQuery");
        flushes.handleReply(new DocumentFlushedCommand(query.token, "<v2/>"), editor.id);

        await expect(saving).resolves.toEqual({ status: "safe", session: editor });
        expect(editor.content).toBe("<v2/>");
    });
});
