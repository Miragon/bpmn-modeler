import { TakeFocusQuery } from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore } from "./EditorSessionStore";
import { WebviewMessageRouter } from "./WebviewMessageRouter";

/**
 * Registers the webview's {@link RequestFocusCommand} on `router`. Only the
 * active editor is told to take focus, so a webview that reloads in a
 * background editor group never pulls focus away from where the user is.
 */
export function registerWebviewFocusHandlers(
    router: WebviewMessageRouter,
    editorStore: EditorSessionStore,
): void {
    router.on("RequestFocusCommand", async (_message, editorId) => {
        if (editorStore.isFocused(editorId)) {
            await editorStore.postMessage(editorId, new TakeFocusQuery());
        }
    });
}
