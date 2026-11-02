import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { LoggerPort } from "../../kernel/domain/hostPorts";
import { ModelerDocumentService, RenderedDocumentService } from "../service/EditorDocumentSync";
import { MessageHandler } from "../service/WebviewMessageRouter";

/** `GetBpmnFileCommand` / `GetDmnFileCommand` / `GetFormFileCommand` / `GetElementTemplateFileCommand` → render the document. */
export function displayDocumentHandler(
    service: RenderedDocumentService,
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
