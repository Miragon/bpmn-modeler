import type { Query } from "./messages";

/** Hands a browser preview's answer to the webview as the host would; no answer sends nothing. */
export function replyFromPreview(query: Query | undefined): void {
    if (query) {
        window.dispatchEvent(new MessageEvent("message", { data: query }));
    }
}

export function logPreviewError({ message, stack }: { message: string; stack?: string }): void {
    console.error(stack ? `${message}\n${stack}` : message);
}
