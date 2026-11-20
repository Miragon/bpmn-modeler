import type { DiagramBounds, Point } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel } from "./layoutModel";
import { type PlaneIndex, byPlaneWithGrid } from "./layoutPlanes";
import { polylineBounds, segmentsOf } from "./layoutPolyline";
import type { Segment } from "./layoutSegments";

/** Every drawn flow's segments by plane, found through a grid, with the routes repaired so far. */
export class FlowSegments {
    private readonly planes: ReadonlyMap<string, PlaneIndex<LayoutEdge>>;
    private readonly rerouted = new Map<string, readonly Point[]>();

    constructor(private readonly layout: LayoutModel) {
        const drawn = [...layout.edges.values()].filter(({ waypoints }) => waypoints.length > 0);
        this.planes = byPlaneWithGrid(drawn, ({ waypoints }) => polylineBounds(waypoints));
    }

    reroute(id: string, waypoints: readonly Point[]): void {
        this.rerouted.set(id, waypoints);
    }

    /** The segments of the other flows on the edge's plane whose drawing meets the window. */
    segmentsNear(edge: LayoutEdge, window: DiagramBounds): Segment[] {
        const plane = this.planes.get(edge.plane);
        const near = new Set(
            plane?.grid.indicesNear(window).map((index) => plane.items[index]!.id) ?? [],
        );
        for (const id of this.rerouted.keys()) {
            if (this.layout.edges.get(id)?.plane === edge.plane) near.add(id);
        }
        near.delete(edge.id);
        return [...near].flatMap((id) =>
            segmentsOf(this.rerouted.get(id) ?? this.layout.edges.get(id)!.waypoints),
        );
    }
}
