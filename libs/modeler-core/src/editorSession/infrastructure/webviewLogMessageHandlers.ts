import { Command } from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../../kernel/domain/hostPorts";
import { routeWebviewLogCommand } from "../service/webviewLog";
import { MessageHandler, WebviewMessageRouter } from "../service/WebviewMessageRouter";

/**
 * Handles each of the four webview `Log*Command`s, routing it onto the host's
 * {@link LoggerPort} via {@link routeWebviewLogCommand}.
 *
 * `resolveSource` turns the handler's `editorId` into a human-readable origin
 * (typically the diagram's basename) so log lines are correlatable when several
 * editors are open; when omitted or when it returns `undefined`, lines fall back
 * to the bare `[webview]` tag.
 */
export function webviewLogHandler(
    logger: LoggerPort,
    resolveSource?: (editorId: string) => string | undefined,
): MessageHandler {
    return (message: Command, editorId: string) => {
        routeWebviewLogCommand(logger, message, resolveSource?.(editorId));
    };
}

/** Registers {@link webviewLogHandler} on `router` for the four webview `Log*Command`s. */
export function registerWebviewLogHandlers(
    router: WebviewMessageRouter,
    logger: LoggerPort,
    resolveSource?: (editorId: string) => string | undefined,
): void {
    const handle = webviewLogHandler(logger, resolveSource);
    router
        .on("LogDebugCommand", handle)
        .on("LogInfoCommand", handle)
        .on("LogWarningCommand", handle)
        .on("LogErrorCommand", handle);
}
