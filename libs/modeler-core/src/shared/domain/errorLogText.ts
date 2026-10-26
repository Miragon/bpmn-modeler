const ENDS_WITH_PUNCTUATION = /[.!?:]$/;

/**
 * An `Error` as the hosts log it: the stack, which leads with `name: message`
 * and keeps the throw site. The cause chain stays out, as in VS Code's log.
 * A string, such as a webview-forwarded stack, is logged as it is.
 */
export function errorLogText(error: string | Error): string {
    if (!(error instanceof Error)) return String(error);
    return error.stack ?? `${error.name}: ${error.message}`;
}

/** Leads with the caller's context, so the log says what failed as the toast does. */
export function notifiedErrorLogText(context: string, error: Error): string {
    const separator = ENDS_WITH_PUNCTUATION.test(context) ? " " : ": ";
    return `${context}${separator}${errorLogText(error)}`;
}

/** The toast every host shows for `notifyError`: what failed, then the error's own message. */
export function notifiedErrorToastText(context: string, error: Error): string {
    // Call sites cast what they caught to `Error`, so any thrown value can arrive.
    const message = error instanceof Error ? error.message : String(error);
    return `${context}\n${message}`;
}
