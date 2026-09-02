import {
    Command,
    SyncDocumentCommand,
    UpdateFormOutputValuesCommand,
} from "@miragon/bpmn-modeler-shared";

import { FormModelerService, MessageHandler } from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { FormValuesController } from "../FormValuesController";

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

export function getFormInputValuesHandler(formValues: FormValuesController): MessageHandler {
    return async (_message: Command, editorId: string) => formValues.sendInputValues(editorId);
}

export function updateFormOutputValuesHandler(formValues: FormValuesController): MessageHandler {
    return (message: Command, editorId: string) => {
        formValues.updateOutputValues(editorId, (message as UpdateFormOutputValuesCommand).content);
    };
}
