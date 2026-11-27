import GridModule from "diagram-js-grid";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental The canvas grid. */
export function grid(): BpmnFeature {
    return { id: "grid", modules: [GridModule] };
}
