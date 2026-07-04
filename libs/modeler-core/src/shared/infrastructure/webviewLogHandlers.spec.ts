import { describe, expect, it, vi } from "vitest";

import {
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
} from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../domain/hostPorts";
import { WebviewMessageRouter } from "./WebviewMessageRouter";
import { registerWebviewLogHandlers } from "./webviewLogHandlers";

const EDITOR = "file:///w/a.bpmn";

/** Wires a router to a spy logger so tests can dispatch a command and read the call. */
function setup() {
    const logger = {
        logDebug: vi.fn(),
        logInfo: vi.fn(),
        logWarning: vi.fn(),
        logError: vi.fn(),
    };
    const router = new WebviewMessageRouter();
    registerWebviewLogHandlers(router, logger as unknown as LoggerPort);
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
});
