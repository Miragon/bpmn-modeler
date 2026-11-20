import { afterEach, describe, expect, it, vi } from "vitest";

import { DocumentFlushedCommand, LogErrorCommand, LogWarningCommand, Query } from "./messages";
import {
    logPreviewError,
    type PreviewCommandTable,
    previewRouteOf,
    replyFromPreview,
    routePreviewCommand,
} from "./previewCommandTable";

type SampleCommand = LogWarningCommand | DocumentFlushedCommand;

interface SampleSession {
    readonly heard: string[];
}

const SAMPLE_TABLE: PreviewCommandTable<SampleCommand, SampleSession> = {
    LogWarningCommand: ({ message }, session) => session.heard.push(message),
    DocumentFlushedCommand: { ignored: "the sample has no file to save" },
};

class SampleQuery extends Query {
    constructor() {
        super("SampleQuery");
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("routePreviewCommand", () => {
    it("hands a command and the session to its row", () => {
        const session: SampleSession = { heard: [] };

        routePreviewCommand(SAMPLE_TABLE, new LogWarningCommand("careful"), session);

        expect(session.heard).toEqual(["careful"]);
    });

    it("logs why it drops a command whose row is a reason", () => {
        const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
        const command = new DocumentFlushedCommand(3);

        routePreviewCommand(SAMPLE_TABLE, command, { heard: [] });

        expect(debug).toHaveBeenCalledWith(
            "[DEBUG] DocumentFlushedCommand ignored: the sample has no file to save",
            command,
        );
    });

    it("throws for a message whose type has no row", () => {
        const command = new LogErrorCommand("broken") as unknown as SampleCommand;

        expect(() => routePreviewCommand(SAMPLE_TABLE, command, { heard: [] })).toThrow(
            "Unknown message type: LogErrorCommand",
        );
    });
});

describe("previewRouteOf", () => {
    it("reads the row of a command type", () => {
        expect(previewRouteOf(SAMPLE_TABLE, "DocumentFlushedCommand")).toEqual({
            ignored: "the sample has no file to save",
        });
    });

    it.each(["toString", "constructor", "hasOwnProperty"])(
        "throws for the inherited object member %s",
        (type) => {
            expect(() => previewRouteOf(SAMPLE_TABLE, type)).toThrow(
                `Unknown message type: ${type}`,
            );
        },
    );
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
