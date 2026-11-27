import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Keyboard navigation along the flow, into planes and across links. */
export function flowNavigation(): BpmnFeature {
    return { id: "flowNavigation", modules: [FlowNavigationModule] };
}
