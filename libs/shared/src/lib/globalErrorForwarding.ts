import { LogErrorCommand } from "./messages";

/**
 * Event-bus and DOM callbacks run outside any per-message try/catch, so without
 * this their failures only ever reach the webview console.
 *
 * @returns Removes both listeners again.
 */
export function installGlobalErrorForwarding(
    post: (command: LogErrorCommand) => void,
    target: Window = window,
): () => void {
    const forwardError = (event: ErrorEvent): void => {
        post(new LogErrorCommand(`Unhandled error: ${event.message}`, event.error?.stack));
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
