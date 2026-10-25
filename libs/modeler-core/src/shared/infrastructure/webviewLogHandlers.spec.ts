import { describe, expect, it, vi } from "vitest";

import {
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
} from "@miragon/bpmn-modeler-shared";

import { RecordingNotifier } from "../../testing";
import { WebviewMessageRouter } from "./WebviewMessageRouter";
import { registerWebviewLogHandlers, routeWebviewLogCommand } from "./webviewLogHandlers";

const EDITOR = "file:///w/a.bpmn";

/** `resolveSource` is passed through so tag-context behaviour is testable. */
function setup(resolveSource?: (editorId: string) => string | undefined) {
    const logger = new RecordingNotifier();
    const router = new WebviewMessageRouter();
    registerWebviewLogHandlers(router, logger, resolveSource);
    return { logger, router };
}

describe("registerWebviewLogHandlers", () => {
    it("routes each level to its logger method with a [webview] prefix", async () => {
        const { logger, router } = setup();

        await router.dispatch(new LogDebugCommand("d"), EDITOR);
        await router.dispatch(new LogInfoCommand("i"), EDITOR);
        await router.dispatch(new LogWarningCommand("w"), EDITOR);
        await router.dispatch(new LogErrorCommand("e"), EDITOR);

        expect(logger.logs).toEqual([
            { level: "debug", message: "[webview] d" },
            { level: "info", message: "[webview] i" },
            { level: "warning", message: "[webview] w" },
            { level: "error", message: "[webview] e" },
        ]);
    });

    it("appends the stack to an error command when present", async () => {
        const { logger, router } = setup();

        await router.dispatch(new LogErrorCommand("boom", "at foo (x.js:1)"), EDITOR);

        expect(logger.logged("error")).toEqual(["[webview] boom\nat foo (x.js:1)"]);
    });

    it("omits the stack when the error command carries none", async () => {
        const { logger, router } = setup();

        await router.dispatch(new LogErrorCommand("boom"), EDITOR);

        expect(logger.logged("error")).toEqual(["[webview] boom"]);
    });

    it("does not cross-fire levels (a debug command logs only at debug)", async () => {
        const { logger, router } = setup();

        await router.dispatch(new LogDebugCommand("d"), EDITOR);

        expect(logger.logs).toEqual([{ level: "debug", message: "[webview] d" }]);
    });

    it("tags lines with the resolved source when a resolver is supplied", async () => {
        const { logger, router } = setup(() => "a.bpmn");

        await router.dispatch(new LogWarningCommand("w"), EDITOR);
        await router.dispatch(new LogErrorCommand("boom", "at foo"), EDITOR);

        expect(logger.logged("warning")).toEqual(["[webview:a.bpmn] w"]);
        expect(logger.logged("error")).toEqual(["[webview:a.bpmn] boom\nat foo"]);
    });

    it("falls back to the bare [webview] tag when the resolver returns undefined", async () => {
        const { logger, router } = setup(() => undefined);

        await router.dispatch(new LogInfoCommand("i"), EDITOR);

        expect(logger.logged("info")).toEqual(["[webview] i"]);
    });

    it("passes the originating editorId to the resolver", async () => {
        const resolveSource = vi.fn(() => "a.bpmn");
        const { router } = setup(resolveSource);

        await router.dispatch(new LogInfoCommand("i"), EDITOR);

        expect(resolveSource).toHaveBeenCalledWith(EDITOR);
    });
});

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
