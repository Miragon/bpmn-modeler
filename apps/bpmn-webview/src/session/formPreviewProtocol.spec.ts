import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FormPreviewQuery, type FormPreviewReply } from "@miragon/bpmn-modeler-shared";
import type { SurfaceHandle } from "../surface";
import type { FormPreviewRequest } from "@miragon/bpmn-modeler";
import { createProtocolCapabilities, DEFINITION_SEARCH_TIMEOUT_MS } from "./protocolCapabilities";

const requests = vi.hoisted(() => ({ pending: [] as Promise<FormPreviewReply>[] }));

vi.mock("./formPreview", () => ({
    createFormPreview: (read: (id: string, automatic: boolean) => Promise<FormPreviewReply>) => ({
        open: (request: FormPreviewRequest) => {
            requests.pending.push(read(request.id, request.automatic));
            return { close: vi.fn(), reposition: vi.fn() };
        },
        dispose: vi.fn(),
    }),
}));

afterEach(() => vi.useRealTimers());
beforeEach(() => {
    requests.pending = [];
});

function request(id: string, automatic = true): FormPreviewRequest {
    return {
        id,
        automatic,
        anchor: () => ({
            task: { x: 0, y: 0, width: 100, height: 80 },
            canvas: { x: 0, y: 0, width: 800, height: 600 },
        }),
        onClose: vi.fn(),
        onVisibilityChanged: vi.fn(),
        focusCanvas: vi.fn(),
    };
}

describe("form preview protocol", () => {
    it("correlates simultaneous replies even when the host answers out of order", async () => {
        const postMessage = vi.fn();
        const adapter = createProtocolCapabilities({ postMessage }, () => ({}) as SurfaceHandle);
        adapter.capabilities.modelNavigation.formPreview!.open(request("First"));
        adapter.capabilities.modelNavigation.formPreview!.open(request("Second", false));
        const [first, second] = requests.pending;
        const [one, two] = postMessage.mock.calls.map(([message]) => message);
        expect(one.type).toBe("GetFormPreviewCommand");
        expect(one.formId).toBe("First");
        expect(one.automatic).toBe(true);
        expect(two.automatic).toBe(false);
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
        adapter.capabilities.modelNavigation.formPreview!.open(request("First"));
        const [pending] = requests.pending;
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
        adapter.capabilities.modelNavigation.formPreview!.open(request("First"));
        const [pending] = requests.pending;
        adapter.dispose();
        await expect(pending).resolves.toMatchObject({ kind: "unavailable" });
    });
});
