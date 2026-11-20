import { afterEach, describe, expect, it, vi } from "vitest";

import { LogErrorCommand, Query } from "./messages";
import { logPreviewError, replyFromPreview } from "./previewOutput";

class SampleQuery extends Query {
    constructor() {
        super("SampleQuery");
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("replyFromPreview", () => {
    it("dispatches the answer to the window as a host message", () => {
        const page = new EventTarget();
        vi.stubGlobal("window", page);
        const received: unknown[] = [];
        page.addEventListener("message", (event) => received.push((event as MessageEvent).data));
        const query = new SampleQuery();

        replyFromPreview(query);

        expect(received).toEqual([query]);
    });

    it("sends nothing without an answer", () => {
        const page = new EventTarget();
        vi.stubGlobal("window", page);
        const listener = vi.fn();
        page.addEventListener("message", listener);

        replyFromPreview(undefined);

        expect(listener).not.toHaveBeenCalled();
    });
});

describe("logPreviewError", () => {
    it("logs the stack of a caught error under its message", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

        logPreviewError(new LogErrorCommand("Could not render", "Error: boom\n    at render"));

        expect(error).toHaveBeenCalledWith("Could not render\nError: boom\n    at render");
    });

    it("logs the message alone without a stack", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

        logPreviewError(new LogErrorCommand("broken"));

        expect(error).toHaveBeenCalledWith("broken");
    });
});
