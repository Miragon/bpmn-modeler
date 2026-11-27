import { ElementIdsModule } from "@miragon/bpmn-modeler-element-ids";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Element IDs generated from names; a host reaches them with `elementIdsOf`. */
export function elementIds(): BpmnFeature {
    return { id: "elementIds", modules: [ElementIdsModule] };
}
