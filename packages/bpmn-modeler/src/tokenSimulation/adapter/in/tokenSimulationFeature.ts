import { TokenSimulationBehaviorNamesModule } from "./tokenSimulationBehaviorNamesModule";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Token simulation, with bpmn-js's modeling behaviours under their own names. */
export function tokenSimulation(): BpmnFeature {
    return { id: "tokenSimulation", modules: [TokenSimulationBehaviorNamesModule] };
}
