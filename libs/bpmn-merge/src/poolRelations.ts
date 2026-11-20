import {
    type ModdleElement,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import { poolsOf } from "./collaborationPools";
import { isEnteredSubProcess } from "./containerContents";

/** Which pools and lanes the semantic tree holds and what each lane holds. */
export interface PoolRelations {
    readonly pools: ReadonlySet<string>;
    /** The pool drawing each process a participant names. */
    readonly poolsByProcess: ReadonlyMap<string, string>;
    readonly laneParents: ReadonlyMap<string, string>;
    /** The pool drawing each lane's process. */
    readonly lanePools: ReadonlyMap<string, string>;
    readonly lanesByNode: ReadonlyMap<string, readonly string[]>;
}

/**
 * Walks the tree from the definitions down, never up through `$parent`: an
 * element the build moved between the sides' trees keeps its side's parent.
 */
export function poolRelationsOf(definitions: ModdleElement): PoolRelations {
    const pools = new Set<string>();
    const poolsByProcess = new Map<string, string>();
    const laneParents = new Map<string, string>();
    const lanePools = new Map<string, string>();
    const lanesByNode = new Map<string, string[]>();

    const visitLanes = (laneSets: unknown, parent: string, pool?: string) => {
        for (const lane of moddleElements(laneSets).flatMap(({ lanes }) => moddleElements(lanes))) {
            if (lane.id === undefined) continue;
            laneParents.set(lane.id, parent);
            if (pool !== undefined) lanePools.set(lane.id, pool);
            for (const node of moddleElements(lane.flowNodeRef)) {
                if (node.id === undefined) continue;
                const lanes = lanesByNode.get(node.id);
                if (lanes === undefined) lanesByNode.set(node.id, [lane.id]);
                else lanes.push(lane.id);
            }
            if (isModdleElement(lane.childLaneSet)) visitLanes([lane.childLaneSet], lane.id, pool);
        }
    };
    const visitSubProcessLanes = (container: ModdleElement) => {
        for (const element of moddleElements(container.flowElements)) {
            if (!isEnteredSubProcess(element)) continue;
            visitLanes(element.laneSets, element.id);
            visitSubProcessLanes(element);
        }
    };

    const roots = moddleElements(definitions.rootElements);
    for (const collaboration of roots.filter((root) => isType(root, "bpmn:Collaboration"))) {
        for (const { pool, process } of poolsOf(collaboration)) {
            pools.add(pool);
            if (process !== undefined) poolsByProcess.set(process, pool);
        }
    }
    for (const process of roots.filter((root) => isType(root, "bpmn:Process"))) {
        if (process.id === undefined) continue;
        visitLanes(process.laneSets, process.id, poolsByProcess.get(process.id));
        visitSubProcessLanes(process);
    }
    return { pools, poolsByProcess, laneParents, lanePools, lanesByNode };
}
