/** Rejects malformed events and messages posted by form iframe components. */
export function shouldHandleHostMessage(
    event: MessageEvent<unknown>,
    currentWindow: Window = window,
): boolean {
    const source = event.source;
    // VS Code masks parent, but the active frame still exposes its embedding wrapper.
    const embeddingWindow = currentWindow.frameElement?.ownerDocument.defaultView;
    const knownHostSource =
        source === null ||
        source === currentWindow ||
        source === currentWindow.parent ||
        source === currentWindow.top ||
        source === embeddingWindow;
    if (!knownHostSource) return false;

    const data = event.data;
    if (typeof data !== "object" || data === null || !("type" in data)) return false;
    if (data.type === "FormFileQuery" || data.type === "FormInputValuesQuery") {
        return "content" in data && typeof data.content === "string";
    }
    if (data.type === "FlushDocumentQuery" || data.type === "ReleaseDocumentFlushQuery") {
        return "token" in data && Number.isInteger(data.token);
    }
    return false;
}
