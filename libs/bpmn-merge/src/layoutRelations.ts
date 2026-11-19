import {
    type ModdleElement,
    idOf,
    isModdleElement,
    isType,
    moddleElements,
} from "@miragon/bpmn-modeler-diff";

import { type ConnectionEnds, connectionEndsOf } from "./connectionEnds";
import type { Outline } from "./layoutGeometry";
import type { EdgeKind } from "./layoutModel";

interface NodeRelations {
    readonly outline: Outline;
    readonly subProcesses: readonly string[];
    readonly pool?: string;
    readonly host?: string;
    readonly mayLieOutsidePool: boolean;
}

/** What decides where an element's drawing may lie, read from the semantic tree. */
export interface LayoutRelations {
    readonly nodes: ReadonlyMap<string, NodeRelations>;
    readonly pools: ReadonlySet<string>;
    readonly laneParents: ReadonlyMap<string, string>;
    /** The pool drawing each lane's process. */
    readonly lanePools: ReadonlyMap<string, string>;
    readonly lanesByNode: ReadonlyMap<string, readonly string[]>;
    readonly connections: ReadonlyMap<string, ConnectionEnds>;
    readonly connectionKinds: ReadonlyMap<string, EdgeKind>;
}

interface Scope {
    readonly subProcesses: readonly string[];
    readonly pool?: string;
}

/**
 * Walks the tree from the definitions down, never up through `$parent`: an
 * element the build moved between the sides' trees keeps its side's parent.
 */
export function layoutRelationsOf(definitions: ModdleElement): LayoutRelations {
    const nodes = new Map<string, NodeRelations>();
    const pools = new Set<string>();
    const laneParents = new Map<string, string>();
    const lanePools = new Map<string, string>();
    const lanesByNode = new Map<string, string[]>();
    const connections = new Map<string, ConnectionEnds>();
    const connectionKinds = new Map<string, EdgeKind>();
    const poolsByProcess = new Map<string, string>();

    const connect = (connection: ModdleElement, holder?: ModdleElement) => {
        const ends = connectionEndsOf(connection, holder);
        if (connection.id === undefined || ends === undefined) return;
        connections.set(connection.id, ends);
        connectionKinds.set(connection.id, edgeKindOf(connection));
    };
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
    const visitArtifacts = (artifacts: unknown, scope: Scope) => {
        for (const artifact of moddleElements(artifacts)) {
            if (isType(artifact, "bpmn:Association")) {
                connect(artifact);
            } else if (isType(artifact, "bpmn:TextAnnotation") && artifact.id !== undefined) {
                nodes.set(artifact.id, nodeRelationsOf(artifact, scope));
            }
        }
    };
    const visitFlowElements = (container: ModdleElement, scope: Scope) => {
        for (const element of moddleElements(container.flowElements)) {
            if (isType(element, "bpmn:SequenceFlow")) {
                connect(element);
                continue;
            }
            if (element.id === undefined) continue;
            nodes.set(element.id, nodeRelationsOf(element, scope));
            for (const association of moddleElements(element.dataInputAssociations)) {
                connect(association, element);
            }
            for (const association of moddleElements(element.dataOutputAssociations)) {
                connect(association, element);
            }
            if (isType(element, "bpmn:SubProcess")) {
                visitLanes(element.laneSets, element.id);
                visitFlowElements(element, {
                    ...scope,
                    subProcesses: [element.id, ...scope.subProcesses],
                });
            }
        }
        visitArtifacts(container.artifacts, scope);
    };

    const roots = moddleElements(definitions.rootElements);
    for (const collaboration of roots.filter((root) => isType(root, "bpmn:Collaboration"))) {
        for (const participant of moddleElements(collaboration.participants)) {
            if (participant.id === undefined) continue;
            pools.add(participant.id);
            const process = idOf(participant.processRef);
            if (process !== undefined) poolsByProcess.set(process, participant.id);
        }
        for (const messageFlow of moddleElements(collaboration.messageFlows)) {
            connect(messageFlow);
        }
        visitArtifacts(collaboration.artifacts, { subProcesses: [] });
    }
    for (const process of roots.filter((root) => isType(root, "bpmn:Process"))) {
        if (process.id === undefined) continue;
        const pool = poolsByProcess.get(process.id);
        visitLanes(process.laneSets, process.id, pool);
        visitFlowElements(
            process,
            pool === undefined ? { subProcesses: [] } : { subProcesses: [], pool },
        );
    }
    return { nodes, pools, laneParents, lanePools, lanesByNode, connections, connectionKinds };
}

function edgeKindOf(connection: ModdleElement): EdgeKind {
    if (isType(connection, "bpmn:SequenceFlow")) return "sequenceFlow";
    return isType(connection, "bpmn:MessageFlow") ? "messageFlow" : "association";
}

function nodeRelationsOf(element: ModdleElement, scope: Scope): NodeRelations {
    const host = idOf(element.attachedToRef);
    return {
        outline: outlineOf(element),
        subProcesses: scope.subProcesses,
        ...(scope.pool === undefined ? {} : { pool: scope.pool }),
        ...(host === undefined ? {} : { host }),
        mayLieOutsidePool: isType(element, "bpmn:DataStoreReference"),
    };
}

function outlineOf(element: ModdleElement): Outline {
    if (isType(element, "bpmn:Event")) return "circle";
    if (isType(element, "bpmn:Gateway")) return "diamond";
    return "rectangle";
}
