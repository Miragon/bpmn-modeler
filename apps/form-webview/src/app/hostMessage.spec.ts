import { describe, expect, it } from "vitest";

import { shouldHandleHostMessage } from "./hostMessage";

function createVsCodeFrameContext(): {
    currentWindow: Window;
    hostWindow: Window;
    dispose: () => void;
} {
    const outerFrame = document.createElement("iframe");
    const topFrame = document.createElement("iframe");
    document.body.append(outerFrame, topFrame);
    const hostWindow = outerFrame.contentWindow!;
    const activeFrame = hostWindow.document.createElement("iframe");
    hostWindow.document.body.append(activeFrame);
    const currentWindow = {} as Window;
    Object.defineProperties(currentWindow, {
        parent: { value: currentWindow },
        top: { value: topFrame.contentWindow },
        frameElement: { value: activeFrame },
        document: { value: activeFrame.contentDocument },
        location: { value: { origin: window.origin } },
    });

    return {
        currentWindow,
        hostWindow,
        dispose: () => {
            outerFrame.remove();
            topFrame.remove();
        },
    };
}

describe("shouldHandleHostMessage", () => {
    it("accepts a typed top-level message", () => {
        const event = new MessageEvent("message", {
            data: { type: "FormFileQuery", content: "{}" },
            source: window,
        });

        expect(shouldHandleHostMessage(event)).toBe(true);
    });

    it("accepts a typed message from the VS Code parent frame", () => {
        const originalParent = Object.getOwnPropertyDescriptor(window, "parent");
        const parentFrame = document.createElement("iframe");
        document.body.append(parentFrame);
        const parent = parentFrame.contentWindow!;
        Object.defineProperty(window, "parent", { configurable: true, value: parent });

        try {
            const event = new MessageEvent("message", {
                data: { type: "FormFileQuery", content: "{}" },
                source: parent,
            });

            expect(shouldHandleHostMessage(event)).toBe(true);
        } finally {
            if (originalParent) Object.defineProperty(window, "parent", originalParent);
            parentFrame.remove();
        }
    });

    it.each([
        { type: "FormFileQuery", content: "{}" },
        { type: "FormInputValuesQuery", content: "{}" },
        { type: "FlushDocumentQuery", token: 1 },
        { type: "ReleaseDocumentFlushQuery", token: 1 },
    ])("accepts a typed $type from the VS Code host frame", (data) => {
        const { currentWindow, hostWindow, dispose } = createVsCodeFrameContext();

        try {
            const event = new MessageEvent("message", {
                data,
                origin: window.origin,
                source: hostWindow,
            });

            expect(shouldHandleHostMessage(event, currentWindow)).toBe(true);
        } finally {
            dispose();
        }
    });

    it("rejects a same-origin detached frame", () => {
        const iframe = document.createElement("iframe");
        document.body.append(iframe);
        const source = iframe.contentWindow;
        iframe.remove();
        const event = new MessageEvent("message", {
            data: { type: "FormFileQuery", content: "{}" },
            origin: window.origin,
            source,
        });

        expect(shouldHandleHostMessage(event)).toBe(false);
    });

    it("rejects malformed messages", () => {
        expect(shouldHandleHostMessage(new MessageEvent("message", { data: null }))).toBe(false);
    });

    it("rejects messages posted by a form iframe", () => {
        const iframe = document.createElement("iframe");
        document.body.append(iframe);
        const event = new MessageEvent("message", {
            data: { type: "FormFileQuery", content: "{}" },
            origin: window.origin,
            source: iframe.contentWindow,
        });

        expect(shouldHandleHostMessage(event)).toBe(false);
    });

    it("rejects messages posted by a nested form iframe", () => {
        const iframe = document.createElement("iframe");
        document.body.append(iframe);
        const nested = iframe.contentDocument?.createElement("iframe");
        expect(nested).toBeDefined();
        iframe.contentDocument?.body.append(nested!);
        const event = new MessageEvent("message", {
            data: { type: "FlushDocumentQuery", token: 1 },
            origin: window.origin,
            source: nested?.contentWindow,
        });

        expect(shouldHandleHostMessage(event)).toBe(false);
    });

    it("rejects unsupported payloads from the top-level source", () => {
        const event = new MessageEvent("message", {
            data: { type: "FormFileQuery", content: 42 },
            source: window,
        });

        expect(shouldHandleHostMessage(event)).toBe(false);
    });
});
