import { moddleDescriptor } from "../../moddle/domain/bpmnModdleFactory";

export type ExecutionEngine = "camunda" | "zeebe";

/** A Camunda 7 or 8 moddle descriptor with the namespace it describes. */
export interface ExecutionPackage {
    readonly prefix: string;
    readonly uri: string;
    readonly descriptor: unknown;
}

export function executionPackage(module: unknown): ExecutionPackage {
    const descriptor = moddleDescriptor(module);
    const { prefix, uri } = descriptor as { prefix?: unknown; uri?: unknown };
    if (typeof prefix !== "string" || typeof uri !== "string") {
        throw new Error("A Camunda moddle descriptor names no `prefix` and `uri`.");
    }
    return { prefix, uri, descriptor };
}
