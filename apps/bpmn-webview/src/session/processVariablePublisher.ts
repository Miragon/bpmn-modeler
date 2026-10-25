import type { BpmnModeler } from "@miragon/bpmn-modeler";
import {
    UpdateScriptVariablesCommand,
    extractProcessVariables,
} from "@miragon/bpmn-modeler-shared";
import { asyncDebounce } from "@miragon/bpmn-modeler-types";

import type { BpmnDocumentSession } from "./documentSession";
import type { HostChannel } from "./hostChannel";

interface ProcessVariablePublisher {
    /** Debounced; publishes only when the variable set differs from the last one sent. */
    schedule(): void;
    cancel(): void;
}

/** Feeds the host's script editors the process variables a C7 model declares. */
export function createProcessVariablePublisher(
    host: HostChannel,
    modeler: Pick<BpmnModeler, "getDefinitions">,
    session: Pick<BpmnDocumentSession, "isReloadingForEngine">,
): ProcessVariablePublisher {
    let lastPublishedJson = "";
    const publish = asyncDebounce(async () => {
        if (session.isReloadingForEngine) return;
        const variables = extractProcessVariables(modeler.getDefinitions());
        const json = JSON.stringify(variables);
        if (json === lastPublishedJson) return;
        lastPublishedJson = json;
        host.postMessage(new UpdateScriptVariablesCommand(variables));
    }, 300);

    return {
        schedule: () => {
            if (!session.isReloadingForEngine) void publish();
        },
        cancel: () => publish.cancel(),
    };
}
