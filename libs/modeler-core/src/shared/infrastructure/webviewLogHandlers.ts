import { Command, LogMessageCommand } from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../domain/hostPorts";
import { WebviewMessageRouter } from "./WebviewMessageRouter";

/**
 * Routes the four webview `Log*Command`s onto the host's {@link LoggerPort}.
 *
 * The sandboxed webview cannot write to the output channel / `idea.log`, so it
 * forwards log entries as commands. Without these handlers the router treats an
 * unknown type as a no-op, so webview diagnostics are silently dropped — the
 * exact "webview errors never reach the output channel" gap issue #1210
 * describes. Shared by every host (VS Code + the IntelliJ bridge) so the two
 * transports can't drift.
 *
 * Each line is tagged `[webview]` to mark its origin in a channel the host also
 * writes to directly; the error handler appends the command's textual `stack`
 * (an `Error` doesn't survive `postMessage`) so the original throw site prints.
 */
export function registerWebviewLogHandlers(router: WebviewMessageRouter, logger: LoggerPort): void {
    router
        .on("LogDebugCommand", (message: Command) => {
            logger.logDebug(prefix(message as LogMessageCommand));
        })
        .on("LogInfoCommand", (message: Command) => {
            logger.logInfo(prefix(message as LogMessageCommand));
        })
        .on("LogWarningCommand", (message: Command) => {
            logger.logWarning(prefix(message as LogMessageCommand));
        })
        .on("LogErrorCommand", (message: Command) => {
            const command = message as LogMessageCommand;
            const body = command.stack ? `${command.message}\n${command.stack}` : command.message;
            logger.logError(`[webview] ${body}`);
        });
}

/** Prefixes a log command's message with the webview-origin marker. */
function prefix(command: LogMessageCommand): string {
    return `[webview] ${command.message}`;
}
