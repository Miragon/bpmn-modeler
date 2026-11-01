import { Command, LogMessageCommand } from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../../kernel/domain/hostPorts";

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
 * forwards log entries as commands. Callers outside
 * `registerWebviewLogHandlers` (the deployment dispatcher's `switch`, the diff
 * pane router's log route) use this to get the same routing, without
 * duplicating the formatter or the four-way level fan-out — so the transports
 * can't drift.
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
