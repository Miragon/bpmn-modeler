import { createBpmnLayoutModule } from "@miragon/bpmn-modeler-layout";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Formatting and cleanup; the layout library's helpers reach them on a surface. */
export function layout(): BpmnFeature {
    return { id: "layout", modules: [createBpmnLayoutModule()] };
}
