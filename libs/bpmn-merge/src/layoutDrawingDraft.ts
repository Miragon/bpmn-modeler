import type { DiagramBounds } from "./layoutGeometry";
import {
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    translatedEdge,
    translatedNode,
} from "./layoutModel";
import { type PlaneIndex, type PlaneNodes, byPlaneWithGrid, planeNodesOf } from "./layoutPlanes";
import { polylineBounds } from "./layoutPolyline";
import type { ShapeGroup } from "./layoutShapeGroups";

interface DraftIndex {
    readonly nodes: ReadonlyMap<string, PlaneNodes>;
    readonly edges: ReadonlyMap<string, PlaneIndex<LayoutEdge>>;
}

/**
 * A drawing the shape moves change, read as a layout: the grids of the
 * original drawing find what lies near a spot, and every shape or edge
 * changed so far is checked as well.
 */
export class DrawingDraft implements LayoutModel {
    private constructor(
        private readonly shapeMap: Map<string, LayoutShape>,
        private readonly edgeMap: Map<string, LayoutEdge>,
        private readonly changedShapes: Set<string>,
        private readonly changedEdges: Set<string>,
        private readonly index: DraftIndex,
    ) {}

    get shapes(): ReadonlyMap<string, LayoutShape> {
        return this.shapeMap;
    }

    get edges(): ReadonlyMap<string, LayoutEdge> {
        return this.edgeMap;
    }

    static of(layout: LayoutModel): DrawingDraft {
        const nodes = [...layout.shapes.values()].filter(
            (shape): shape is NodeShape => shape.kind === "node",
        );
        const drawn = [...layout.edges.values()].filter(({ waypoints }) => waypoints.length > 0);
        return new DrawingDraft(
            new Map(layout.shapes),
            new Map(layout.edges),
            new Set(),
            new Set(),
            {
                nodes: planeNodesOf(nodes),
                edges: byPlaneWithGrid(drawn, ({ waypoints }) => polylineBounds(waypoints)),
            },
        );
    }

    /** A copy to try changes on, which leaves this draft as it is. */
    fork(): DrawingDraft {
        return new DrawingDraft(
            new Map(this.shapeMap),
            new Map(this.edgeMap),
            new Set(this.changedShapes),
            new Set(this.changedEdges),
            this.index,
        );
    }

    get changed(): boolean {
        return this.changedShapes.size > 0 || this.changedEdges.size > 0;
    }

    node(id: string): NodeShape | undefined {
        const shape = this.shapes.get(id);
        return shape?.kind === "node" ? shape : undefined;
    }

    /** The plane's nodes whose drawing may meet the box, as they lie now. */
    nodesNear(plane: string, box: DiagramBounds): NodeShape[] {
        const original = this.index.nodes.get(plane);
        const ids = new Set(original?.grid.indicesNear(box).map((at) => original.items[at]!.id));
        for (const id of this.changedShapes) ids.add(id);
        return [...ids].flatMap((id) => {
            const node = this.node(id);
            return node?.plane === plane ? [node] : [];
        });
    }

    /** The plane's drawn edges that may meet the box, as they run now. */
    edgesNear(plane: string, box: DiagramBounds): LayoutEdge[] {
        const original = this.index.edges.get(plane);
        const ids = new Set(original?.grid.indicesNear(box).map((at) => original.items[at]!.id));
        for (const id of this.changedEdges) ids.add(id);
        return [...ids].flatMap((id) => {
            const edge = this.edges.get(id);
            return edge?.plane === plane ? [edge] : [];
        });
    }

    nodesOn(plane: string): NodeShape[] {
        return [...this.shapes.values()].filter(
            (shape): shape is NodeShape => shape.kind === "node" && shape.plane === plane,
        );
    }

    edgesOn(plane: string): LayoutEdge[] {
        return [...this.edges.values()].filter((edge) => edge.plane === plane);
    }

    replaceShape(shape: LayoutShape): void {
        this.shapeMap.set(shape.id, shape);
        this.changedShapes.add(shape.id);
    }

    replaceEdge(edge: LayoutEdge): void {
        this.edgeMap.set(edge.id, edge);
        this.changedEdges.add(edge.id);
    }

    /** Moves the group's members, their labels and the edges between them by the offset. */
    translate(group: ShapeGroup, dx: number, dy: number): void {
        for (const id of group.members) {
            const member = this.node(id);
            if (member !== undefined) this.replaceShape(translatedNode(member, dx, dy));
        }
        for (const id of group.innerEdges) {
            const edge = this.edgeMap.get(id);
            if (edge !== undefined) this.replaceEdge(translatedEdge(edge, dx, dy));
        }
    }
}
