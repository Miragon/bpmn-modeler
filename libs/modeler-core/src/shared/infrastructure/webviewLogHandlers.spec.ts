import { describe, expect, it, vi } from "vitest";

import {
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
} from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../domain/hostPorts";
import { WebviewMessageRouter } from "./WebviewMessageRouter";
import { registerWebviewLogHandlers, routeWebviewLogCommand } from "./webviewLogHandlers";

const EDITOR = "file:///w/a.bpmn";

/** A fresh spy logger with all four levels stubbed. */
function spyLogger() {
    return {
        logDebug: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
    };
}

/**
 * Wires a router to a spy logger so tests can dispatch a command and read the
 * call. `resolveSource` is passed through so tag-context behaviour is testable.
 */
function setup(resolveSource?: (editorId: string) => string | undefined) {
    const logger = spyLogger();
    const router = new WebviewMessageRouter();
    registerWebviewLogHandlers(router, logger as unknown as LoggerPort, resolveSource);
    return { logger, router };
}

describe("registerWebviewLogHandlers", () => {
    it("routes each level to its logger method with a [webview] prefix", async () => {
        const { logger, router } = setup();

        await router.dispatch(new LogDebugCommand("d"), EDITOR);
        await router.dispatch(new LogInfoCommand("i"), EDITOR);
        await router.dispatch(new LogWarningCommand("w"), EDITOR);
        await router.dispatch(new LogErrorCommand("e"), EDITOR);

        expect(logger.logDebug).toHaveBeenCalledWith("[webview] d");
        expect(logger.logInfo).toHaveBeenCalledWith("[webview] i");
        expect(logger.logWarning).toHaveBeenCalledWith("[webview] w");
        expect(logger.logError).toHaveBeenCalledWith("[webview] e");
    });

    it("appends the stack to an error command when present", async () => {
        const { logger, router } = setup();

        await router.dispatch(new LogErrorCommand("boom", "at foo (x.js:1)"), EDITOR);

        expect(logger.logError).toHaveBeenCalledWith("[webview] boom\nat foo (x.js:1)");
    });

    it("omits the stack when the error command carries none", async () => {
        const { logger, router } = setup();

        await router.dispatch(new LogErrorCommand("boom"), EDITOR);

        expect(logger.logError).toHaveBeenCalledWith("[webview] boom");
    });

    it("does not cross-fire levels (a debug command logs only at debug)", async () => {
        const { logger, router } = setup();

        await router.dispatch(new LogDebugCommand("d"), EDITOR);

        expect(logger.logInfo).not.toHaveBeenCalled();
        expect(logger.logWarning).not.toHaveBeenCalled();
        expect(logger.logError).not.toHaveBeenCalled();
    });

    it("tags lines with the resolved source when a resolver is supplied", async () => {
        const { logger, router } = setup(() => "a.bpmn");

        await router.dispatch(new LogWarningCommand("w"), EDITOR);
        await router.dispatch(new LogErrorCommand("boom", "at foo"), EDITOR);

        expect(logger.logWarning).toHaveBeenCalledWith("[webview:a.bpmn] w");
        expect(logger.logError).toHaveBeenCalledWith("[webview:a.bpmn] boom\nat foo");
    });

    it("falls back to the bare [webview] tag when the resolver returns undefined", async () => {
        const { logger, router } = setup(() => undefined);

        await router.dispatch(new LogInfoCommand("i"), EDITOR);

        expect(logger.logInfo).toHaveBeenCalledWith("[webview] i");
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
        const logger = spyLogger();

        expect(
            routeWebviewLogCommand(logger as unknown as LoggerPort, new LogDebugCommand("d")),
        ).toBe(true);
        expect(
            routeWebviewLogCommand(logger as unknown as LoggerPort, new LogInfoCommand("i")),
        ).toBe(true);

        expect(logger.logDebug).toHaveBeenCalledWith("[webview] d");
        expect(logger.logInfo).toHaveBeenCalledWith("[webview] i");
    });

    it("returns false and logs nothing for a non-log command", () => {
        const logger = spyLogger();

        const handled = routeWebviewLogCommand(
            logger as unknown as LoggerPort,
            { type: "SyncDocumentCommand" } as never,
            "deployment",
        );

        expect(handled).toBe(false);
        expect(logger.logDebug).not.toHaveBeenCalled();
        expect(logger.logInfo).not.toHaveBeenCalled();
        expect(logger.logWarning).not.toHaveBeenCalled();
        expect(logger.logError).not.toHaveBeenCalled();
    });

    it("tags with the given source and appends an error stack", () => {
        const logger = spyLogger();

        routeWebviewLogCommand(
            logger as unknown as LoggerPort,
            new LogErrorCommand("boom", "at foo (x.js:1)"),
            "deployment",
        );

        expect(logger.logError).toHaveBeenCalledWith("[webview:deployment] boom\nat foo (x.js:1)");
    });
});
