import { Command, isMessageOfType } from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore } from "./EditorSessionStore";

/**
 * Runs `dispatch` for one webview message. Document syncs are serialised per
 * editor and dropped once the host revision they were based on is stale, so a
 * slow earlier write can never land after a newer one.
 */
export async function dispatchInDocumentOrder(
    store: EditorSessionStore,
    editorId: string,
    session: object,
    message: Command,
    dispatch: () => Promise<void>,
): Promise<void> {
    if (!isMessageOfType(message, "SyncDocumentCommand")) {
        await dispatch();
        return;
    }
    const sync = message;
    if (!store.isHostDocumentRevisionCurrent(editorId, sync.documentRevision)) return;
    await store.runInEditorQueue(editorId, async () => {
        await dispatch();
        if (store.isHostDocumentRevisionCurrent(editorId, sync.documentRevision)) {
            store.recordDocumentSync(editorId, session, sync.content);
        }
    });
}
