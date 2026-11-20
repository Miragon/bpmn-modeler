import type { Query } from "@miragon/bpmn-modeler-shared";

/** Hands a query to the webview as if its host had sent it. */
export function replyToWebview(query: Query): void {
    window.dispatchEvent(new MessageEvent("message", { data: query }));
}
