import type { LogMessageCommand } from "./messages";

/** The host and the browser previews both log a webview's entry as this text, so they cannot drift. */
export function webviewLogText({ type, message, stack }: LogMessageCommand): string {
    return type === "LogErrorCommand" && stack ? `${message}\n${stack}` : message;
}
