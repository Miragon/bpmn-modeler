import ExecutableFixModule from "bpmn-js-executable-fix";

import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";

/** @experimental Marks every process executable, as the engines expect. */
export function executableFix(): BpmnFeature {
    return { id: "executableFix", modules: [ExecutableFixModule] };
}
