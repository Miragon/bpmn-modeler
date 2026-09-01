import { Command, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";

import { FormModelerService, MessageHandler } from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";

export function getFormFileHandler(
    formService: FormModelerService,
    notifier: VsCodeNotifier,
): MessageHandler {
    return async (_message: Command, editorId: string) => {
        if (await formService.display(editorId)) {
            notifier.logDebug("Form editor is ready");
        }
    };
}

export function syncFormDocumentHandler(formService: FormModelerService): MessageHandler {
    return async (message: Command, editorId: string) => {
        const sync = message as SyncDocumentCommand;
        await formService.sync(editorId, sync.content, sync.documentRevision);
    };
}
