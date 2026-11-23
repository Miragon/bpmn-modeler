import { afterEach, describe, expect, it, vi } from "vitest";

import {
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    Query,
} from "./messages";
import { type PreviewCommandTable, routePreviewCommand } from "./previewCommandTable";
import {
    logPreviewDebug,
    logPreviewError,
    logPreviewInfo,
    logPreviewWarning,
    replyFromPreview,
} from "./previewOutput";

class SampleQuery extends Query {
    constructor() {
        super("SampleQuery");
    }
}

const LOG_ROWS: PreviewCommandTable<
    LogDebugCommand | LogInfoCommand | LogWarningCommand | LogErrorCommand,
    unknown
> = {
    LogDebugCommand: logPreviewDebug,
    LogInfoCommand: logPreviewInfo,
    LogWarningCommand: logPreviewWarning,
    LogErrorCommand: logPreviewError,
};

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

describe("a browser preview's log rows", () => {
    it.each([
        { command: new LogDebugCommand("debug text"), level: "debug" },
        { command: new LogInfoCommand("info text"), level: "info" },
        { command: new LogWarningCommand("warning text"), level: "warn" },
        { command: new LogErrorCommand("error text"), level: "error" },
    ] as const)("write a $command.type to the console's $level", ({ command, level }) => {
        const write = vi.spyOn(console, level).mockImplementation(() => undefined);

        routePreviewCommand(LOG_ROWS, command, undefined);

        expect(write.mock.calls).toEqual([[command.message]]);
    });

    it("log the stack of a caught error under its message", () => {
        const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

        routePreviewCommand(
            LOG_ROWS,
            new LogErrorCommand("Could not render", "Error: boom\n    at render"),
            undefined,
        );

        expect(error).toHaveBeenCalledWith("Could not render\nError: boom\n    at render");
    });
});
