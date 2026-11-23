import type {
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    Query,
} from "./messages";

/** Hands a browser preview's answer to the webview as the host would; no answer sends nothing. */
export function replyFromPreview(query: Query | undefined): void {
    if (query) {
        window.dispatchEvent(new MessageEvent("message", { data: query }));
    }
}

// Every preview's row for a webview's log, one per level. Functions rather than one
// table to spread: a surface takes only its own levels, and a module-level property
// read would keep a preview table in the production bundle.

export function logPreviewDebug({ message }: LogDebugCommand): void {
    console.debug(message);
}

export function logPreviewInfo({ message }: LogInfoCommand): void {
    console.info(message);
}

export function logPreviewWarning({ message }: LogWarningCommand): void {
    console.warn(message);
}

/** Only an error carries its stack, as the host logs it. */
export function logPreviewError({ message, stack }: LogErrorCommand): void {
    console.error(stack ? `${message}\n${stack}` : message);
}
