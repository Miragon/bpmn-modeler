import { type DiagramBounds, boundsAround } from "./layoutGeometry";
import {
    FLOW_ENDS,
    type LayoutModel,
    type NodeShape,
    drawnPartsOf,
    nodeShapeIn,
} from "./layoutModel";

/** A node with everything that moves with it. */
export interface ShapeGroup {
    readonly node: NodeShape;
    /** The node first, then its boundary events and, drawn open, its contents, in document order. */
    readonly members: readonly string[];
    /** The edges between members, which move with them. */
    readonly innerEdges: readonly string[];
    /** The edges from a member to a shape outside, which the flow repair re-routes. */
    readonly attachedEdges: readonly string[];
}

/** Which nodes and edges move with a node: its boundary events and, for a sub-process drawn open, its contents. */
export class ShapeGroups {
    private readonly hosted = new Map<string, string[]>();
    private readonly contents = new Map<string, string[]>();
    private readonly edgesByEnd = new Map<string, string[]>();

    constructor(layout: LayoutModel) {
        for (const shape of layout.shapes.values()) {
            if (shape.kind !== "node") continue;
            if (shape.host !== undefined) listUnder(this.hosted, shape.host, shape.id);
            for (const subProcess of shape.subProcesses) {
                listUnder(this.contents, subProcess, shape.id);
            }
        }
        for (const edge of layout.edges.values()) {
            for (const end of new Set(FLOW_ENDS.map((at) => edge[at]))) {
                if (end !== undefined) listUnder(this.edgesByEnd, end, edge.id);
            }
        }
    }

    /** The node's group as the layout draws it now. */
    of(layout: LayoutModel, node: NodeShape): ShapeGroup {
        const contents = node.expanded ? (this.contents.get(node.id) ?? []) : [];
        const candidates = [...(this.hosted.get(node.id) ?? []), ...contents];
        const members = [
            node.id,
            ...candidates.filter((id) => nodeShapeIn(layout, id)?.plane === node.plane),
        ];
        const inGroup = new Set(members);
        const innerEdges: string[] = [];
        const attachedEdges: string[] = [];
        for (const id of new Set(members.flatMap((member) => this.edgesByEnd.get(member) ?? []))) {
            const edge = layout.edges.get(id);
            if (edge?.plane !== node.plane) continue;
            const inner = FLOW_ENDS.every((at) => edge[at] !== undefined && inGroup.has(edge[at]));
            (inner ? innerEdges : attachedEdges).push(id);
        }
        return { node, members, innerEdges, attachedEdges };
    }
}

/** The group's own edges, which move with it or which the flow repair re-routes. */
export function ownEdgesOf(group: ShapeGroup): ReadonlySet<string> {
    return new Set([...group.innerEdges, ...group.attachedEdges]);
}

/** Each member's shape and label as the layout draws them. */
export function groupPartsIn(layout: LayoutModel, group: ShapeGroup): DiagramBounds[] {
    return group.members.flatMap((id) => {
        const member = nodeShapeIn(layout, id);
        return member === undefined ? [] : drawnPartsOf(member);
    });
}

/** The members' shapes and labels as the layout draws them. */
export function groupBoundsIn(layout: LayoutModel, group: ShapeGroup): DiagramBounds {
    return boundsAround(groupPartsIn(layout, group));
}

/** The members' shapes as the layout draws them, without their labels. */
export function groupShapesBoundsIn(layout: LayoutModel, group: ShapeGroup): DiagramBounds {
    return boundsAround(
        group.members.flatMap((id) => {
            const member = nodeShapeIn(layout, id);
            return member === undefined ? [] : [member.bounds];
        }),
    );
}

function listUnder(lists: Map<string, string[]>, key: string, id: string): void {
    const list = lists.get(key);
    if (list === undefined) lists.set(key, [id]);
    else list.push(id);
}
