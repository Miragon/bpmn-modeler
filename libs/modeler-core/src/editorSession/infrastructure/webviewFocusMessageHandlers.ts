import { RequestFocusCommand, TakeFocusQuery } from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore } from "../service/EditorSessionStore";
import { MessageHandler, WebviewMessageRouter } from "../service/WebviewMessageRouter";

/**
 * Handles the webview's {@link RequestFocusCommand}. Only the active editor is
 * told to take focus, so a webview that reloads in a background editor group
 * never pulls focus away from where the user is.
 */
export function requestFocusHandler(
    editorStore: EditorSessionStore,
): MessageHandler<RequestFocusCommand> {
    return async (_message, editorId) => {
        if (editorStore.isFocused(editorId)) {
            await editorStore.postMessage(editorId, new TakeFocusQuery());
        }
    };
}

/** Registers {@link requestFocusHandler} on `router`. */
export function registerWebviewFocusHandlers(
    router: WebviewMessageRouter,
    editorStore: EditorSessionStore,
): void {
    router.on("RequestFocusCommand", requestFocusHandler(editorStore));
}
