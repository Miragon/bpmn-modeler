/** Leads every host log line about a message the webview failed to handle. */
export function receiveErrorPrefix(messageType: string): string {
    return `Error receiving message: ${messageType} — `;
}
