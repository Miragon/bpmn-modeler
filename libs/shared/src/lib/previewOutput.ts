import type {
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    Query,
} from "./messages";
import { webviewLogText } from "./webviewLogText";

/** Hands a browser preview's answer to the webview as the host would; no answer sends nothing. */
export function replyFromPreview(query: Query | undefined): void {
    if (query) {
        window.dispatchEvent(new MessageEvent("message", { data: query }));
    }
}

// Every preview's row for a webview's log, one per level. Functions rather than one
// table to spread: a surface takes only its own levels, and a module-level property
// read or spread would keep a preview table in the production bundle.

export function logPreviewDebug(command: LogDebugCommand): void {
    console.debug(webviewLogText(command));
}

export function logPreviewInfo(command: LogInfoCommand): void {
    console.info(webviewLogText(command));
}

export function logPreviewWarning(command: LogWarningCommand): void {
    console.warn(webviewLogText(command));
}

export function logPreviewError(command: LogErrorCommand): void {
    console.error(webviewLogText(command));
}
