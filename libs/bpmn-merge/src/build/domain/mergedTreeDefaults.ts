import type { ModdleElement } from "@miragon/bpmn-modeler-diff/domain";

import type { RestoredFlowDefault } from "../../decide/domain/removedWith";

/**
 * Sets each restored default on the result's source and returns the flow set
 * per source. A source whose type holds no default flow, such as a gateway the
 * other side turned into a parallel one under the same id, keeps none.
 */
export function restoreDefaultFlows(
    resultUnits: ReadonlyMap<string, ModdleElement>,
    flowDefaults: readonly RestoredFlowDefault[],
): ReadonlyMap<string, string> {
    const restored = new Map<string, string>();
    for (const flowDefault of flowDefaults) {
        if (flowDefault.kind !== "restored") continue;
        const source = resultUnits.get(flowDefault.source);
        const flow = resultUnits.get(flowDefault.flow);
        if (source === undefined || flow === undefined || !holdsDefaultFlow(source)) continue;
        source.default = flow;
        restored.set(flowDefault.source, flowDefault.flow);
    }
    return restored;
}

function holdsDefaultFlow(element: ModdleElement): boolean {
    return (element.$descriptor.properties ?? []).some(
        (property) => property.name === "default" && property.isReference === true,
    );
}
