// Consumer tsc programs do not pick up this lib's ambient shims from its
// tsconfig `include`, so the shim is referenced where the descriptors are imported.
// eslint-disable-next-line @typescript-eslint/triple-slash-reference
/// <reference path="./types/execution-moddle.d.ts" />

import { moddleDescriptor } from "./bpmnModdleFactory";

export type ExecutionEngine = "camunda" | "zeebe";

/** A Camunda 7 or 8 moddle descriptor with the namespace it describes. */
export interface ExecutionPackage {
    readonly prefix: string;
    readonly uri: string;
    readonly descriptor: unknown;
}

const DESCRIPTOR_MODULES: Readonly<Record<ExecutionEngine, () => Promise<unknown>>> = {
    camunda: () => import("camunda-bpmn-moddle/resources/camunda.json"),
    zeebe: () => import("zeebe-bpmn-moddle/resources/zeebe.json"),
};

/** Loads the descriptor lazily, as the parser is loaded. */
export async function loadExecutionPackage(engine: ExecutionEngine): Promise<ExecutionPackage> {
    return executionPackage(await DESCRIPTOR_MODULES[engine]());
}

function executionPackage(module: unknown): ExecutionPackage {
    const descriptor = moddleDescriptor(module);
    const { prefix, uri } = descriptor as { prefix?: unknown; uri?: unknown };
    if (typeof prefix !== "string" || typeof uri !== "string") {
        throw new Error("A Camunda moddle descriptor names no `prefix` and `uri`.");
    }
    return { prefix, uri, descriptor };
}
