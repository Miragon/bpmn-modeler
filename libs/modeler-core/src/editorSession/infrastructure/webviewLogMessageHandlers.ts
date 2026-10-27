import { Command } from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../../kernel/domain/hostPorts";
import { routeWebviewLogCommand } from "../service/webviewLog";
import { WebviewMessageRouter } from "../service/WebviewMessageRouter";

/**
 * Registers the four webview `Log*Command`s on `router`, routing each onto the
 * host's {@link LoggerPort} via {@link routeWebviewLogCommand}.
 *
 * `resolveSource` turns the handler's `editorId` into a human-readable origin
 * (typically the diagram's basename) so log lines are correlatable when several
 * editors are open; when omitted or when it returns `undefined`, lines fall back
 * to the bare `[webview]` tag.
 */
export function registerWebviewLogHandlers(
    router: WebviewMessageRouter,
    logger: LoggerPort,
    resolveSource?: (editorId: string) => string | undefined,
): void {
    const handle: (message: Command, editorId: string) => void = (message, editorId) => {
        routeWebviewLogCommand(logger, message, resolveSource?.(editorId));
    };
    router
        .on("LogDebugCommand", handle)
        .on("LogInfoCommand", handle)
        .on("LogWarningCommand", handle)
        .on("LogErrorCommand", handle);
}
