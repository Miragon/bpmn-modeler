import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../domain/hostPorts";
import { ModelerDocumentService } from "./EditorDocumentSync";
import { MessageHandler } from "./WebviewMessageRouter";

/** `GetBpmnFileCommand` / `GetDmnFileCommand` / `GetFormFileCommand` → render the document. */
export function displayDocumentHandler(
    service: ModelerDocumentService,
    logger: LoggerPort,
    readyMessage: string,
): MessageHandler {
    return async (_message: Command, editorId: string) => {
        if (await service.display(editorId)) {
            logger.logDebug(readyMessage);
        }
    };
}

/** `SyncDocumentCommand` → persist the webview's content; ordering lives in {@link dispatchInDocumentOrder}. */
export function syncDocumentHandler(
    service: ModelerDocumentService,
): MessageHandler<SyncDocumentCommand> {
    return async (sync, editorId) => {
        await service.sync(editorId, sync.content, sync.documentRevision);
    };
}
