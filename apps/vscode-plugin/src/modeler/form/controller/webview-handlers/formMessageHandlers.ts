import { Command, UpdateFormOutputValuesCommand } from "@miragon/bpmn-modeler-shared";

import { MessageHandler } from "@miragon/bpmn-modeler-core";
import { FormValuesController } from "../FormValuesController";

export function getFormInputValuesHandler(formValues: FormValuesController): MessageHandler {
    return async (_message: Command, editorId: string) => formValues.sendInputValues(editorId);
}

export function updateFormOutputValuesHandler(
    formValues: FormValuesController,
): MessageHandler<UpdateFormOutputValuesCommand> {
    return (message, editorId) => {
        formValues.updateOutputValues(editorId, message.content);
    };
}
