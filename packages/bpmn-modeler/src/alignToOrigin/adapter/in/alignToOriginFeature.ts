import AlignToOriginModule from "@bpmn-io/align-to-origin";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Moves the diagram back to the origin when asked, never on save. */
export function alignToOrigin(): BpmnFeature {
    return {
        id: "alignToOrigin",
        modules: [AlignToOriginModule],
        config: { alignToOrigin: { alignOnSave: false, offset: 150, tolerance: 50 } },
    };
}
