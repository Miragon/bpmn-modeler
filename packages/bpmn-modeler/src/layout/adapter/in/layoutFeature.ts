import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Formatting and cleanup; a host reaches them with `layoutOf`. */
export function layout(): BpmnFeature {
    return { id: "layout", modules: [createBpmnLayoutModule()] };
}
