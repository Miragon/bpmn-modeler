import { afterEach, describe, expect, it, vi } from "vitest";
import { FormPreviewQuery, type FormPreviewReply } from "@miragon/bpmn-modeler-shared";
import type { SurfaceHandle } from "../surface";
import { createProtocolCapabilities, DEFINITION_SEARCH_TIMEOUT_MS } from "./protocolCapabilities";

vi.mock("./formPreview", () => ({
    createFormPreview: (read: (id: string) => Promise<FormPreviewReply>) => ({
        open: read,
        dispose: vi.fn(),
    }),
}));

afterEach(() => vi.useRealTimers());

describe("form preview protocol", () => {
    it("correlates simultaneous replies even when the host answers out of order", async () => {
        const postMessage = vi.fn();
        const adapter = createProtocolCapabilities({ postMessage }, () => ({}) as SurfaceHandle);
        const first = adapter.capabilities.modelNavigation.previewForm!({
            id: "First",
            kind: "form",
        });
        const second = adapter.capabilities.modelNavigation.previewForm!({
            id: "Second",
            kind: "form",
        });
        const [one, two] = postMessage.mock.calls.map(([message]) => message);
        expect(one.type).toBe("GetFormPreviewCommand");
        expect(one.formId).toBe("First");
        adapter.handlers.FormPreviewQuery(
            new FormPreviewQuery(two.requestId, { kind: "loaded", content: "second" }),
        );
        adapter.handlers.FormPreviewQuery(
            new FormPreviewQuery(one.requestId, { kind: "loaded", content: "first" }),
        );
        await expect(first).resolves.toEqual({ kind: "loaded", content: "first" });
        await expect(second).resolves.toEqual({ kind: "loaded", content: "second" });
    });

    it("settles unanswered requests with feedback at the deadline", async () => {
        vi.useFakeTimers();
        const adapter = createProtocolCapabilities(
            { postMessage: vi.fn() },
            () => ({}) as SurfaceHandle,
        );
        const pending = adapter.capabilities.modelNavigation.previewForm!({
            id: "First",
            kind: "form",
        });
        await vi.advanceTimersByTimeAsync(DEFINITION_SEARCH_TIMEOUT_MS);
        await expect(pending).resolves.toEqual({
            kind: "unavailable",
            message: expect.stringContaining("did not answer"),
        });
    });

    it("cancels pending replies when the webview is disposed", async () => {
        const adapter = createProtocolCapabilities(
            { postMessage: vi.fn() },
            () => ({}) as SurfaceHandle,
        );
        const pending = adapter.capabilities.modelNavigation.previewForm!({
            id: "First",
            kind: "form",
        });
        adapter.dispose();
        await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
    });
});
