/**
 * An `Error` as the hosts log it: the stack, which leads with `name: message`
 * and keeps the throw site. The cause chain stays out, as in VS Code's log.
 */
export function errorLogText(error: Error): string {
    return error.stack ?? `${error.name}: ${error.message}`;
}

/** Leads with the caller's context, so the log says what failed as the toast does. */
export function notifiedErrorLogText(context: string, error: Error): string {
    return `${context}: ${errorLogText(error)}`;
}
