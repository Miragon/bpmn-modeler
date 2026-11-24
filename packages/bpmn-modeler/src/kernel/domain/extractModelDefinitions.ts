import {
    extractModelDefinitions as extractModelDefinitionsCore,
    type ModelDefinition,
} from "@miragon/bpmn-modeler-types/domain";

/**
 * Lists the messages, signals, errors and escalations a BPMN file declares,
 * together with the flow nodes that throw or catch them — the building block
 * for a `definitionSearch` port backed by the consumer's own model store.
 *
 * Thin local wrapper so the rolled-up `.d.ts` emits a clean ambient signature
 * instead of inlining the implementation body.
 */
export function extractModelDefinitions(xml: string): ModelDefinition[] {
    return extractModelDefinitionsCore(xml);
}
