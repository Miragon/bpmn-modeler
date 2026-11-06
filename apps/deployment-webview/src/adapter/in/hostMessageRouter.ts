import { asProtocolMessage, Command, Query } from "@miragon/bpmn-modeler-shared";

import type { DeploymentForm } from "./form";
import type { StartInstanceForm } from "./startInstanceForm";

type DeploymentFormPort = Pick<
    DeploymentForm,
    | "populate"
    | "setAdditionalFiles"
    | "populateCredentials"
    | "setTargets"
    | "showTargetResult"
    | "showResult"
>;

type StartInstanceFormPort = Pick<
    StartInstanceForm,
    "setProcessDefinitionKey" | "setPayloadFile" | "showResult"
>;

export function routeHostMessage(
    msg: Query | Command,
    form: DeploymentFormPort,
    startForm: StartInstanceFormPort,
): void {
    const query = asProtocolMessage(msg);
    switch (query.type) {
        case "FormDefaultsQuery":
            form.populate(query.defaults);
            break;
        case "AdditionalFilesQuery":
            form.setAdditionalFiles(query.filePaths);
            break;
        case "StoredCredentialsQuery":
            form.populateCredentials(query);
            break;
        case "DeploymentTargetsQuery":
            form.setTargets(query);
            break;
        case "TargetSavedQuery": {
            const saved = query;
            form.showTargetResult(saved.success, saved.message);
            break;
        }
        case "DeploymentResultQuery":
            form.showResult(query);
            break;
        case "ProcessDefinitionKeyQuery":
            startForm.setProcessDefinitionKey(query.processDefinitionKey);
            break;
        case "SelectedPayloadFileQuery": {
            const payload = query;
            startForm.setPayloadFile(payload.filePath, payload.label);
            break;
        }
        case "StartInstanceResultQuery":
            startForm.showResult(query);
            break;
        default:
            console.debug("[DeploymentWebview] Unhandled message type:", msg.type);
    }
}
