import { afterEach, describe, expect, it, vi } from "vitest";

import {
    ClipboardQuery,
    type Command,
    HOST_REPLY_TIMEOUT_MS,
    type Query,
    TextClipboardQuery,
} from "@miragon/bpmn-modeler-shared";
import type { ClipboardOptions } from "@miragon/bpmn-modeler";

import { resolveClipboard } from "./protocolClipboard";

function createHost() {
    const sent: (Command | Query)[] = [];
    return {
        sent,
        postMessage: vi.fn((message: Command | Query) => {
            sent.push(message);
        }),
        sentTypes: () => sent.map((message) => message.type),
    };
}

function protocolClipboard() {
    const host = createHost();
    const { options, handlers } = resolveClipboard(undefined, { isDevelopment: false, host });
    return { host, bridge: options!.bridge, text: options!.text!, handlers };
}

describe("resolveClipboard", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([
        ["a forced native clipboard", "native" as const, false],
        ["the development preview", undefined, true],
    ])("leaves %s to the browser", (_case, injected, isDevelopment) => {
        const host = createHost();

        const clipboard = resolveClipboard(injected, { isDevelopment, host });
        clipboard.handlers.ClipboardQuery(new ClipboardQuery("<bpmn-elements />"));
        clipboard.handlers.TextClipboardQuery(new TextClipboardQuery("label text"));

        expect(clipboard.options).toBeUndefined();
        expect(host.postMessage).not.toHaveBeenCalled();
    });

    it("passes a caller's bridge through unchanged, even in the development preview", () => {
        const host = createHost();
        const injected: ClipboardOptions = {
            bridge: { requestClipboard: vi.fn(async () => ""), writeClipboard: vi.fn() },
        };

        for (const isDevelopment of [false, true]) {
            const clipboard = resolveClipboard(injected, { isDevelopment, host });
            clipboard.handlers.ClipboardQuery(new ClipboardQuery("<bpmn-elements />"));

            expect(clipboard.options).toBe(injected);
        }
        expect(injected.bridge.requestClipboard).not.toHaveBeenCalled();
        expect(host.postMessage).not.toHaveBeenCalled();
    });

    it("pastes element and text replies through separate host channels", async () => {
        const { host, bridge, text, handlers } = protocolClipboard();

        const elementPaste = bridge.requestClipboard();
        handlers.TextClipboardQuery(new TextClipboardQuery("unrequested label"));
        handlers.ClipboardQuery(new ClipboardQuery("<bpmn-elements />"));
        const textPaste = text.requestClipboard();
        handlers.TextClipboardQuery(new TextClipboardQuery("label text"));

        await expect(elementPaste).resolves.toBe("<bpmn-elements />");
        await expect(textPaste).resolves.toBe("label text");
        expect(host.sentTypes()).toEqual(["GetClipboardCommand", "GetTextClipboardCommand"]);
    });

    it("waits for a fresh host reply on every paste", async () => {
        const { bridge, handlers } = protocolClipboard();

        const firstPaste = bridge.requestClipboard();
        handlers.ClipboardQuery(new ClipboardQuery("<first />"));
        await expect(firstPaste).resolves.toBe("<first />");

        const secondPaste = bridge.requestClipboard();
        handlers.ClipboardQuery(new ClipboardQuery("<second />"));
        await expect(secondPaste).resolves.toBe("<second />");
    });

    it("writes each channel to its own host command", () => {
        const { host, bridge, text } = protocolClipboard();

        bridge.writeClipboard("<copied />");
        text.writeClipboard("copied label");

        expect(host.sent).toEqual([
            expect.objectContaining({ type: "SetClipboardCommand", text: "<copied />" }),
            expect.objectContaining({ type: "SetTextClipboardCommand", text: "copied label" }),
        ]);
    });

    it("pastes nothing for a reply without text", async () => {
        const { text, handlers } = protocolClipboard();

        const paste = text.requestClipboard();
        handlers.TextClipboardQuery(new TextClipboardQuery(undefined as unknown as string));

        await expect(paste).resolves.toBe("");
    });

    it.each(["bridge", "text"] as const)(
        "skips a %s paste the host never answers and logs a warning",
        async (channel) => {
            vi.useFakeTimers();
            const clipboard = protocolClipboard();
            const settled = vi.fn();
            void clipboard[channel].requestClipboard().then(settled);

            await vi.advanceTimersByTimeAsync(HOST_REPLY_TIMEOUT_MS - 1);
            expect(settled).not.toHaveBeenCalled();

            await vi.advanceTimersByTimeAsync(1);
            expect(settled).toHaveBeenCalledWith("");
            expect(clipboard.host.sent).toContainEqual(
                expect.objectContaining({
                    type: "LogWarningCommand",
                    message: "No clipboard reply from the host; paste skipped",
                }),
            );
        },
    );
});
