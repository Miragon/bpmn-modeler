// Consumer tsc programs do not pick up this lib's ambient shims from its
// tsconfig `include`, so the shim is referenced where `bpmn-moddle` is imported.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/bpmn-moddle.d.ts" />

import { type BpmnModdleFactory, resolveBpmnModdleFactory } from "../domain/bpmnModdleFactory";

/** Loads the parser lazily, so a consumer that never parses never pays for it. */
export async function loadBpmnModdle(): Promise<BpmnModdleFactory> {
    return resolveBpmnModdleFactory(await import("bpmn-moddle"));
}
