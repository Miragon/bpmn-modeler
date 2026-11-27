import MinimapModule from "diagram-js-minimap";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental The canvas overview. */
export function minimap(): BpmnFeature {
    return { id: "minimap", modules: [MinimapModule] };
}
