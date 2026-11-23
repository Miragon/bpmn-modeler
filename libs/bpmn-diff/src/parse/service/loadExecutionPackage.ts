// Consumer tsc programs do not pick up this lib's ambient shims from its
// tsconfig `include`, so the shim is referenced where the descriptors are imported.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="../../types/execution-moddle.d.ts" />

import {
    type ExecutionEngine,
    type ExecutionPackage,
    executionPackage,
} from "../domain/executionPackage";

const DESCRIPTOR_MODULES: Readonly<Record<ExecutionEngine, () => Promise<unknown>>> = {
    camunda: () => import("camunda-bpmn-moddle/resources/camunda.json"),
    zeebe: () => import("zeebe-bpmn-moddle/resources/zeebe.json"),
};

/** Loads the descriptor lazily, as the parser is loaded. */
export async function loadExecutionPackage(engine: ExecutionEngine): Promise<ExecutionPackage> {
    return executionPackage(await DESCRIPTOR_MODULES[engine]());
}
