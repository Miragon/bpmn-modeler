import { LogErrorCommand } from "./messages";

/**
 * Event-bus and DOM callbacks run outside any per-message try/catch, so without
 * this their failures only ever reach the webview console. An error a
 * listener handled with `preventDefault()` is that listener's to report.
 *
 * @returns Removes both listeners again.
 */
export function installGlobalErrorForwarding(
    post: (command: LogErrorCommand) => void,
    target: Window = window,
): () => void {
    // Listeners on the window run in the order they were added, so one added
    // later (a plugin loader that reports its plugin's error itself) can only
    // claim the error after this one ran: decide once the dispatch is over.
    const forwardError = (event: ErrorEvent): void => {
        setTimeout(() => {
            if (!event.defaultPrevented) {
                post(new LogErrorCommand(`Unhandled error: ${event.message}`, event.error?.stack));
            }
        }, 0);
    };
    const forwardRejection = (event: PromiseRejectionEvent): void => {
        const reason: unknown = event.reason;
        post(
            new LogErrorCommand(
                `Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`,
                reason instanceof Error ? reason.stack : undefined,
            ),
        );
    };
    target.addEventListener("error", forwardError);
    target.addEventListener("unhandledrejection", forwardRejection);
    return () => {
        target.removeEventListener("error", forwardError);
        target.removeEventListener("unhandledrejection", forwardRejection);
    };
}
