import {
    type DiagramBounds,
    type Outline,
    type Point,
    boundsAround,
    centerOf,
    inflated,
    outlinePointOn,
    segmentEntersShape,
} from "./layoutGeometry";
import { ShapeGrid } from "./layoutGrid";
import {
    FLOW_ENDS,
    type FlowEnd,
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    endShapeOf,
    nodeShapeIn,
} from "./layoutModel";
import {
    type Segment,
    isOrthogonal,
    nearestPointOn,
    polylineBounds,
    segmentsOf,
    withoutRedundantPoints,
} from "./layoutPolyline";
import { type PlaneNodes, planeNodesOf } from "./layoutPlanes";
import { routeCost, routeOrthogonal } from "./layoutRouter";
import { shapesRunThrough } from "./layoutSpotDetection";
import { type LayoutSpot, endsOffShape, isDrawnWithAnEnd } from "./layoutSpots";

/** What the build does with a flow the merge broke: re-routes it onto its shapes, or leaves it as drawn. */
export type FlowRepair =
    | {
          readonly kind: "movedByBuild";
          readonly flow: string;
          readonly waypoints: readonly Point[];
          /** The label moved with the route, when the flow has one. */
          readonly label?: DiagramBounds;
      }
    | { readonly kind: "notRepaired"; readonly flow: string };

export type FlowRepairKind = FlowRepair["kind"];

/** How far around a flow's ends and waypoints the router looks for shapes, tried from the nearest out. */
const OBSTACLE_WINDOW_MARGINS = [120, 360];

/** How much longer, in pixels of route cost, a flow's own bends may be than a fresh route and still be kept. */
const KEPT_ROUTE_ALLOWANCE = 40;

/** How far, in pixels, a waypoint must lie beside a shape for a straight segment to reach the shape from it. */
const BESIDE_MARGIN = 5;

/**
 * The repair of every flow the spots name for its end off its shape or for a
 * shape it runs through, in the spots' order. A repaired flow meets both its
 * shapes and runs through none; it keeps its own bends where they still fit,
 * else takes an orthogonal route around the shapes near it. Other flows,
 * shapes and labels stay as drawn.
 */
export function planFlowRepairs(layout: LayoutModel, spots: readonly LayoutSpot[]): FlowRepair[] {
    const flows = brokenFlowsOf(spots);
    if (flows.length === 0) return [];
    const nodes = [...layout.shapes.values()].filter(
        (shape): shape is NodeShape => shape.kind === "node",
    );
    const planes = planeNodesOf(nodes);
    const otherFlows = new FlowSegments(layout);
    return flows.map((id) => {
        const edge = layout.edges.get(id);
        const repair: FlowRepair =
            edge === undefined
                ? { kind: "notRepaired", flow: id }
                : repairOf(layout, edge, planes.get(edge.plane), otherFlows);
        if (repair.kind === "movedByBuild") otherFlows.reroute(id, repair.waypoints);
        return repair;
    });
}

function brokenFlowsOf(spots: readonly LayoutSpot[]): string[] {
    const flows = spots.flatMap((spot) =>
        spot.kind === "flowEndOffShape" || spot.kind === "flowThroughShape" ? [spot.flow] : [],
    );
    return [...new Set(flows)];
}

interface FlowEnds {
    readonly source: LayoutShape;
    readonly target: LayoutShape;
}

function repairOf(
    layout: LayoutModel,
    edge: LayoutEdge,
    plane: PlaneNodes | undefined,
    otherFlows: FlowSegments,
): FlowRepair {
    const source = endShapeOf(layout, edge, "source");
    const target = endShapeOf(layout, edge, "target");
    if (source === undefined || target === undefined || edge.waypoints.length < 2) {
        return { kind: "notRepaired", flow: edge.id };
    }
    const ends = { source, target };
    const hosts = hostsOfEnds(layout, ends);
    const fits = (points: readonly Point[] | undefined): points is Point[] =>
        points !== undefined && fitsItsShapes(layout, { ...edge, waypoints: points }, plane, hosts);
    const kept = keptRoute(layout, edge, ends);
    for (const margin of OBSTACLE_WINDOW_MARGINS) {
        const window = inflated(
            boundsAround([source.bounds, target.bounds, polylineBounds(edge.waypoints)]),
            margin,
        );
        const otherSegments = otherFlows.segmentsNear(edge, window);
        const routed = routeOrthogonal({
            source,
            target,
            obstacles: [...obstaclesNear(layout, edge, plane, window), ...hosts],
            otherSegments,
        });
        const keptFits = fits(kept) && isOrthogonal(kept);
        const routedFits = fits(routed);
        const keepsOwnBends =
            keptFits &&
            (!routedFits ||
                routeCost(kept, otherSegments) <=
                    routeCost(routed, otherSegments) + KEPT_ROUTE_ALLOWANCE);
        const waypoints = keepsOwnBends ? kept : routedFits ? routed : undefined;
        if (waypoints !== undefined) return movedByBuild(edge, waypoints);
    }
    return { kind: "notRepaired", flow: edge.id };
}

function movedByBuild(edge: LayoutEdge, waypoints: Point[]): FlowRepair {
    const repair = { kind: "movedByBuild", flow: edge.id, waypoints } as const;
    return edge.label === undefined
        ? repair
        : { ...repair, label: followingLabel(edge.label, edge.waypoints, waypoints) };
}

/** Whether the flow meets both its shapes and runs through no shape, nor through an end's host. */
function fitsItsShapes(
    layout: LayoutModel,
    edge: LayoutEdge,
    plane: PlaneNodes | undefined,
    hosts: readonly DiagramBounds[],
): boolean {
    const throughHost = segmentsOf(edge.waypoints).some(([from, to]) =>
        hosts.some((host) => segmentEntersShape(from, to, host)),
    );
    return (
        !throughHost &&
        endsOffShape(layout, edge).length === 0 &&
        shapesRunThrough(layout, edge, plane).length === 0
    );
}

/** The activities the flow's boundary events sit on, unless the flow ends there too: a route must not cut through them. */
function hostsOfEnds(layout: LayoutModel, ends: FlowEnds): DiagramBounds[] {
    return FLOW_ENDS.flatMap((end) => {
        const node = nodeShapeIn(layout, ends[end].id);
        const host = node?.host === undefined ? undefined : layout.shapes.get(node.host);
        const otherEnd = ends[end === "source" ? "target" : "source"];
        return host === undefined || host.id === otherEnd.id || host.plane !== node?.plane
            ? []
            : [host.bounds];
    });
}

function obstaclesNear(
    layout: LayoutModel,
    edge: LayoutEdge,
    plane: PlaneNodes | undefined,
    window: DiagramBounds,
): DiagramBounds[] {
    if (plane === undefined) return [];
    return plane.grid
        .indicesNear(window)
        .map((index) => plane.nodes[index]!)
        .filter((shape) => !isDrawnWithAnEnd(layout, edge, shape))
        .map(({ bounds }) => bounds);
}

/** The flow with its ends off their shapes docked again, its own bends kept; undefined when no straight segment reaches. */
function keptRoute(layout: LayoutModel, edge: LayoutEdge, ends: FlowEnds): Point[] | undefined {
    const off = new Set<FlowEnd>(endsOffShape(layout, edge).map(({ at }) => at));
    const points = edge.waypoints;
    const first = points[0]!;
    const last = points[points.length - 1]!;
    if (points.length === 2) return keptStraight(first, last, off, ends);
    const start = off.has("source") ? redocked(ends.source, points[1]!) : first;
    const end = off.has("target") ? redocked(ends.target, points[points.length - 2]!) : last;
    if (start === undefined || end === undefined) return undefined;
    return withoutRedundantPoints([start, ...points.slice(1, -1), end]);
}

/** A straight flow stays on its line where both shapes still meet it. */
function keptStraight(
    first: Point,
    last: Point,
    off: ReadonlySet<FlowEnd>,
    ends: FlowEnds,
): Point[] | undefined {
    const axis = first.y === last.y ? "y" : first.x === last.x ? "x" : undefined;
    if (axis === undefined) return undefined;
    const along = axis === "y" ? "x" : "y";
    const line = { axis, at: first[axis] } as const;
    const dock = (end: FlowEnd, kept: Point) => {
        if (!off.has(end)) return kept;
        const shape = ends[end];
        const other = ends[end === "source" ? "target" : "source"];
        const towards = centerOf(other.bounds)[along] > centerOf(shape.bounds)[along] ? 1 : -1;
        return outlinePointOn(line, shape.bounds, shape.outline, towards);
    };
    const start = dock("source", first);
    const end = dock("target", last);
    return start === undefined || end === undefined ? undefined : [start, end];
}

/** The outline point a straight segment from `from` reaches when `from` lies beside, above or below the shape. */
function redocked(
    shape: { readonly bounds: DiagramBounds; readonly outline: Outline },
    from: Point,
): Point | undefined {
    const { bounds, outline } = shape;
    const besideX =
        from.x > bounds.x + BESIDE_MARGIN && from.x < bounds.x + bounds.width - BESIDE_MARGIN;
    const besideY =
        from.y > bounds.y + BESIDE_MARGIN && from.y < bounds.y + bounds.height - BESIDE_MARGIN;
    if (besideY && !besideX) {
        return outlinePointOn(
            { axis: "y", at: from.y },
            bounds,
            outline,
            from.x > bounds.x ? 1 : -1,
        );
    }
    if (besideX && !besideY) {
        return outlinePointOn(
            { axis: "x", at: from.x },
            bounds,
            outline,
            from.y > bounds.y ? 1 : -1,
        );
    }
    return undefined;
}

/** The label keeps its offset from the nearest point of the route, so a label beside a kept segment stays. */
function followingLabel(
    label: DiagramBounds,
    before: readonly Point[],
    after: readonly Point[],
): DiagramBounds {
    const anchorBefore = nearestPointOn(before, centerOf(label));
    const anchorAfter = nearestPointOn(after, anchorBefore);
    return {
        ...label,
        x: Math.round(label.x + anchorAfter.x - anchorBefore.x),
        y: Math.round(label.y + anchorAfter.y - anchorBefore.y),
    };
}

/** Every drawn flow's segments by plane, found through a grid, with the routes repaired so far. */
class FlowSegments {
    private readonly planes = new Map<
        string,
        { readonly edges: readonly LayoutEdge[]; readonly grid: ShapeGrid }
    >();
    private readonly rerouted = new Map<string, readonly Point[]>();

    constructor(private readonly layout: LayoutModel) {
        const byPlane = new Map<string, LayoutEdge[]>();
        for (const edge of layout.edges.values()) {
            if (edge.waypoints.length === 0) continue;
            const onPlane = byPlane.get(edge.plane);
            if (onPlane === undefined) byPlane.set(edge.plane, [edge]);
            else onPlane.push(edge);
        }
        for (const [plane, edges] of byPlane) {
            const grid = new ShapeGrid(edges.map(({ waypoints }) => polylineBounds(waypoints)));
            this.planes.set(plane, { edges, grid });
        }
    }

    reroute(id: string, waypoints: readonly Point[]): void {
        this.rerouted.set(id, waypoints);
    }

    /** The segments of the other flows on the edge's plane whose drawing meets the window. */
    segmentsNear(edge: LayoutEdge, window: DiagramBounds): Segment[] {
        const plane = this.planes.get(edge.plane);
        const near = new Set(
            plane?.grid.indicesNear(window).map((index) => plane.edges[index]!.id) ?? [],
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
