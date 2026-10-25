import { Command, LogMessageCommand } from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../domain/hostPorts";
import { WebviewMessageRouter } from "./WebviewMessageRouter";

/** Command types this module recognises, mapped to the logger method each drives. */
const LOG_LEVELS = {
    LogDebugCommand: "logDebug",
    LogInfoCommand: "logInfo",
    LogWarningCommand: "logWarning",
    LogErrorCommand: "logError",
} as const;

function isLogMessageCommand(
    command: Command,
): command is LogMessageCommand<keyof typeof LOG_LEVELS> {
    return command.type in LOG_LEVELS;
}

/**
 * Logs `command` onto `logger` iff it is one of the four webview `Log*Command`s,
 * returning `true` when it handled it and `false` for any other type.
 *
 * The sandboxed webview cannot write to the output channel / `idea.log`, so it
 * forwards log entries as commands. Callers that own a raw `switch` (the
 * deployment dispatcher, the diff controller) use this to opt into the same
 * routing the {@link WebviewMessageRouter} handlers get, without duplicating the
 * formatter or the four-way level fan-out — so the two transports can't drift.
 *
 * Each line is tagged `[webview:<source>]` (or `[webview]` when no source is
 * known) to mark its origin in a channel the host also writes to directly; the
 * `source` lets a reader correlate a line to a specific file/panel when several
 * are open. The error handler appends the command's textual `stack` (an `Error`
 * doesn't survive `postMessage`) so the original throw site prints.
 */
export function routeWebviewLogCommand(
    logger: LoggerPort,
    command: Command,
    source?: string,
): boolean {
    if (!isLogMessageCommand(command)) {
        return false;
    }
    const method = LOG_LEVELS[command.type];
    const tag = source ? `[webview:${source}]` : "[webview]";

    if (method === "logError") {
        const body = command.stack ? `${command.message}\n${command.stack}` : command.message;
        logger.logError(`${tag} ${body}`);
    } else {
        logger[method](`${tag} ${command.message}`);
    }
    return true;
}

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
