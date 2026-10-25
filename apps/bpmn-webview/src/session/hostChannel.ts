import type { Command, HostApi, Query } from "@miragon/bpmn-modeler-shared";

import type { WebviewState } from "../webviewState";

export type HostChannel = Pick<HostApi<WebviewState, Command | Query>, "postMessage">;

/** Leads every host log line about a message the webview failed to handle. */
export function receiveErrorPrefix(messageType: string): string {
    return `Error receiving message: ${messageType} — `;
}
