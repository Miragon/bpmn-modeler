import {
    ProcessDefinitionKeyQuery,
    SelectedPayloadFileQuery,
    StartInstanceResultQuery,
} from "@miragon/bpmn-modeler-shared";

export function previewProcessDefinitionKey(): ProcessDefinitionKeyQuery {
    return new ProcessDefinitionKeyQuery("Process_0gjrx3e");
}

/** The preview has no workspace to pick a payload file from. */
export function noPayloadFile(): SelectedPayloadFileQuery {
    return new SelectedPayloadFileQuery("", "");
}

/** The preview reaches no engine, so every start succeeds. */
export function startedInstance(): StartInstanceResultQuery {
    return new StartInstanceResultQuery(true, "Process instance started (mock).", "12345");
}
