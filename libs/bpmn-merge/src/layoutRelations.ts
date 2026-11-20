import { type ModdleElement, idOf, isType, moddleElements } from "@miragon/bpmn-modeler-diff";

import { type ConnectionEnds, connectionEndsOf } from "./connectionEnds";
import type { Outline } from "./layoutGeometry";
import type { EdgeKind } from "./layoutModel";
import { type PoolRelations, poolRelationsOf } from "./poolRelations";

interface NodeRelations {
    readonly outline: Outline;
    readonly subProcesses: readonly string[];
    readonly pool?: string;
    readonly host?: string;
    readonly mayLieOutsidePool: boolean;
}

/** A flow, association or message flow: its ends and what it connects. */
interface Connection extends ConnectionEnds {
    readonly kind: EdgeKind;
}

/** What decides where an element's drawing may lie, read from the semantic tree. */
export interface LayoutRelations extends PoolRelations {
    readonly nodes: ReadonlyMap<string, NodeRelations>;
    readonly connections: ReadonlyMap<string, Connection>;
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
    const poolRelations = poolRelationsOf(definitions);
    const nodes = new Map<string, NodeRelations>();
    const connections = new Map<string, Connection>();

    const connect = (kind: EdgeKind, connection: ModdleElement, holder?: ModdleElement) => {
        const ends = connectionEndsOf(connection, holder);
        if (connection.id === undefined || ends === undefined) return;
        connections.set(connection.id, { ...ends, kind });
    };
    const visitArtifacts = (artifacts: unknown, scope: Scope) => {
        for (const artifact of moddleElements(artifacts)) {
            if (isType(artifact, "bpmn:Association")) {
                connect("association", artifact);
            } else if (isType(artifact, "bpmn:TextAnnotation") && artifact.id !== undefined) {
                nodes.set(artifact.id, nodeRelationsOf(artifact, scope));
            }
        }
    };
    const visitFlowElements = (container: ModdleElement, scope: Scope) => {
        for (const element of moddleElements(container.flowElements)) {
            if (isType(element, "bpmn:SequenceFlow")) {
                connect("sequenceFlow", element);
                continue;
            }
            if (element.id === undefined) continue;
            nodes.set(element.id, nodeRelationsOf(element, scope));
            for (const association of moddleElements(element.dataInputAssociations)) {
                connect("association", association, element);
            }
            for (const association of moddleElements(element.dataOutputAssociations)) {
                connect("association", association, element);
            }
            if (isType(element, "bpmn:SubProcess")) {
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
        for (const messageFlow of moddleElements(collaboration.messageFlows)) {
            connect("messageFlow", messageFlow);
        }
        visitArtifacts(collaboration.artifacts, { subProcesses: [] });
    }
    for (const process of roots.filter((root) => isType(root, "bpmn:Process"))) {
        if (process.id === undefined) continue;
        const pool = poolRelations.poolsByProcess.get(process.id);
        visitFlowElements(
            process,
            pool === undefined ? { subProcesses: [] } : { subProcesses: [], pool },
        );
    }
    return { ...poolRelations, nodes, connections };
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
