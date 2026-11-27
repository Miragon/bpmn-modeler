import { ElementIdsModule } from "@miragon/bpmn-modeler-element-ids";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Element IDs generated from names; the element-ID library's helpers reach them on a surface. */
export function elementIds(): BpmnFeature {
    return { id: "elementIds", modules: [ElementIdsModule] };
}
