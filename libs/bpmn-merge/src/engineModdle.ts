import {
    type ExecutionPackage,
    type PrefixedModdle,
    createDocumentModdle,
    loadExecutionPackage,
} from "@miragon/bpmn-modeler-diff";

import type { MergeVersions } from "./computeMerge";
import { executionEngineOf } from "./executionEngine";

export interface MergeModdle extends PrefixedModdle {
    /** Current first, so current keeps its prefixes and the others get a fresh one on a clash. */
    readonly prefixSources: readonly string[];
    readonly engine?: ExecutionPackage;
}

/** Current's engine descriptor, as the modeler saves current with it, and one prefix per namespace of every version. */
export async function createMergeModdle(versions: MergeVersions): Promise<MergeModdle> {
    const prefixSources = [versions.current, versions.incoming, versions.base].filter(
        (xml): xml is string => xml !== undefined,
    );
    const engineName = executionEngineOf(versions.current);
    const engine = engineName === undefined ? undefined : await loadExecutionPackage(engineName);
    return moddleFor(prefixSources, engine);
}

export async function moddleFor(
    prefixSources: readonly string[],
    engine?: ExecutionPackage,
): Promise<MergeModdle> {
    const prefixedModdle = await createDocumentModdle(prefixSources, engine);
    return {
        moddle: prefixedModdle.moddle,
        declarationsFor: prefixedModdle.declarationsFor,
        prefixSources,
        ...(engine === undefined ? {} : { engine }),
    };
}
