import * as bpmnModdle from "bpmn-moddle";

import type { ModdleElementLike } from "../moddleElement";

/** A business object as bpmn-moddle creates it, with what the specs read. */
type BusinessObject = ModdleElementLike & {
    id?: string;
    name?: string;
    eventDefinitions?: unknown[];
    processRef?: BusinessObject;
};

interface BpmnModdleLike {
    create(type: string, attrs?: Record<string, unknown>): BusinessObject;
}

// bpmn-moddle's typings cover the BPMN types, not the factory the package exports.
const { BpmnModdle } = bpmnModdle as unknown as { BpmnModdle: () => BpmnModdleLike };

/** Real business objects, so the lint convention resolves types through `$instanceOf` as the modeler does. */
export const bpmn = BpmnModdle();
