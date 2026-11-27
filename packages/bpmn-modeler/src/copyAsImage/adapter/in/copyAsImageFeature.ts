import { CopyAsImageModule } from "bpmn-js-copy-as-image";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Copies the selection as an image. */
export function copyAsImage(): BpmnFeature {
    return { id: "copyAsImage", modules: [CopyAsImageModule] };
}
