import { describe, expect, it } from "vitest";

import { LogDebugCommand, LogErrorCommand, LogInfoCommand } from "@miragon/bpmn-modeler-shared";

import { RecordingNotifier } from "../../testing";
import { routeWebviewLogCommand } from "./webviewLog";

describe("routeWebviewLogCommand", () => {
    it("returns true and logs for each Log* level", () => {
        const logger = new RecordingNotifier();

        expect(routeWebviewLogCommand(logger, new LogDebugCommand("d"))).toBe(true);
        expect(routeWebviewLogCommand(logger, new LogInfoCommand("i"))).toBe(true);

        expect(logger.logged("debug")).toEqual(["[webview] d"]);
        expect(logger.logged("info")).toEqual(["[webview] i"]);
    });

    it("returns false and logs nothing for a non-log command", () => {
        const logger = new RecordingNotifier();

        const handled = routeWebviewLogCommand(
            logger,
            { type: "SyncDocumentCommand" } as never,
            "deployment",
        );

        expect(handled).toBe(false);
        expect(logger.logs).toEqual([]);
    });

    it("tags with the given source and appends an error stack", () => {
        const logger = new RecordingNotifier();

        routeWebviewLogCommand(
            logger,
            new LogErrorCommand("boom", "at foo (x.js:1)"),
            "deployment",
        );

        expect(logger.logged("error")).toEqual(["[webview:deployment] boom\nat foo (x.js:1)"]);
    });
});
