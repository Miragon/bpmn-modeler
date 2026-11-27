import {
    createDefinitionSearchModule,
    type DefinitionSearchPort,
} from "@miragon/bpmn-modeler-definition-search";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Searches the host's workspace for definitions to reference. */
export function definitionSearch(port: DefinitionSearchPort): BpmnFeature {
    return {
        id: "definitionSearch",
        modules: [createDefinitionSearchModule(port)],
        requires: ["propertiesPanel"],
    };
}
