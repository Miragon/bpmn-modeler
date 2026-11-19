import {
    type AxisLine,
    type DiagramBounds,
    type Outline,
    type Point,
    boundsAround,
    centerOf,
    gapBetween,
    inflated,
    liesWithin,
    outlinePointOn,
    overlapsBeyondTolerance,
    pointBounds,
    segmentEntersOutline,
    segmentEntersShape,
    sideOfCenter,
    spansAlong,
} from "./layoutGeometry";
import {
    FLOW_ENDS,
    type FlowEnd,
    type LayoutEdge,
    type LayoutModel,
    type LayoutShape,
    type NodeShape,
    drawnHostOf,
    endShapeOf,
    nodeShapeIn,
    otherEndOf,
    sharedFrameOf,
} from "./layoutModel";
import { type PlaneIndex, type PlaneNodes, byPlaneWithGrid, planeNodesOf } from "./layoutPlanes";
import {
    type Segment,
    isOrthogonal,
    nearestPointOn,
    polylineBounds,
    segmentsOf,
    withoutRedundantPoints,
} from "./layoutPolyline";
import { routeCost, routeOrthogonal } from "./layoutRouter";
import { shapesRunThrough } from "./layoutSpotDetection";
import { type LayoutSpot, endsOffShape, isDrawnWithAnEnd, isFlowSpot } from "./layoutSpots";

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

/** How far around a flow's ends and waypoints the router looks for shapes, tried from the nearest out. */
const OBSTACLE_WINDOW_MARGINS = [120, 360];

/** How much longer, in pixels of route cost, a flow's own bends may be than a fresh route and still be kept. */
const KEPT_ROUTE_ALLOWANCE = 40;

/**
 * How far, in pixels, a waypoint must lie beside a shape, away from its
 * corners, for a straight segment to reach the shape from it. Narrower than
 * the router's own ports keep, as it keeps a bend the flow already had.
 */
const BESIDE_MARGIN = 5;

/**
 * The repair of every flow the spots name for its end off its shape or for a
 * shape it runs through, in the spots' order. A repaired flow meets both its
 * shapes, runs through none, nor back through an end, and stays inside the
 * sub-process or pool both its ends lie in; it keeps its own bends where they
 * still fit, else takes an orthogonal route around the shapes near it. Other
 * flows, shapes and labels stay as drawn.
 */
export function planFlowRepairs(layout: LayoutModel, spots: readonly LayoutSpot[]): FlowRepair[] {
    const flows = [...new Set(spots.filter(isFlowSpot).map(({ flow }) => flow))];
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

/** The layout with each re-routed flow's waypoints and label; the layout itself when no flow moved. */
export function withFlowRepairs(layout: LayoutModel, repairs: readonly FlowRepair[]): LayoutModel {
    const moved = repairs.flatMap((repair) => (repair.kind === "movedByBuild" ? [repair] : []));
    if (moved.length === 0) return layout;
    const edges = new Map(layout.edges);
    for (const { flow, waypoints, label } of moved) {
        const edge = edges.get(flow);
        if (edge !== undefined) {
            edges.set(
                flow,
                label === undefined ? { ...edge, waypoints } : { ...edge, waypoints, label },
            );
        }
    }
    return { shapes: layout.shapes, edges };
}

interface FlowEnds {
    readonly source: LayoutShape;
    readonly target: LayoutShape;
}

/** What a route of one flow must keep clear of or stay inside. */
interface RouteBounds {
    readonly plane: PlaneNodes | undefined;
    readonly hosts: readonly DiagramBounds[];
    /** The ends a route must not run back through; none when one lies on the other. */
    readonly endsNotToCross: readonly LayoutShape[];
    readonly frame?: DiagramBounds;
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
    const sharedFrame = sharedFrameOf(layout, edge);
    // Grown to hold both ends, as the merge may have moved one out of the frame.
    const frame = sharedFrame && boundsAround([sharedFrame.bounds, source.bounds, target.bounds]);
    const bounds: RouteBounds = {
        plane,
        hosts: hostsOfEnds(layout, ends),
        endsNotToCross: overlapsBeyondTolerance(source.bounds, target.bounds)
            ? []
            : [source, target],
        ...(frame === undefined ? {} : { frame }),
    };
    const fits = (points: readonly Point[] | undefined): points is Point[] =>
        points !== undefined && fitsItsShapes(layout, { ...edge, waypoints: points }, bounds);
    const ownBends = keptRoute(layout, edge, ends);
    const kept = fits(ownBends) && isOrthogonal(ownBends) ? ownBends : undefined;
    for (const margin of OBSTACLE_WINDOW_MARGINS) {
        const window = inflated(
            boundsAround([source.bounds, target.bounds, polylineBounds(edge.waypoints)]),
            margin,
        );
        const otherSegments = otherFlows.segmentsNear(edge, window);
        const keptCost =
            kept === undefined ? Number.POSITIVE_INFINITY : routeCost(kept, otherSegments);
        // No route is shorter than the gap between the ends, so none could beat the kept one.
        if (
            kept !== undefined &&
            keptCost <= gapBetween(source.bounds, target.bounds) + KEPT_ROUTE_ALLOWANCE
        ) {
            return movedByBuild(edge, kept);
        }
        const routed = routeOrthogonal({
            source,
            target,
            obstacles: [...obstaclesNear(layout, edge, ends, plane, window), ...bounds.hosts],
            otherSegments,
            ...(frame === undefined ? {} : { frame }),
        });
        const routedFits = fits(routed);
        const keepsOwnBends =
            kept !== undefined &&
            (!routedFits || keptCost <= routeCost(routed, otherSegments) + KEPT_ROUTE_ALLOWANCE);
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

/**
 * Whether the flow meets both its shapes, runs through no shape, nor through
 * an end's host or back through an end, and bends only inside its frame.
 */
function fitsItsShapes(layout: LayoutModel, edge: LayoutEdge, bounds: RouteBounds): boolean {
    const { hosts, endsNotToCross, frame, plane } = bounds;
    const segments = segmentsOf(edge.waypoints);
    const throughHost = segments.some(([from, to]) =>
        hosts.some((host) => segmentEntersShape(from, to, host)),
    );
    const throughEnd = segments.some(([from, to]) =>
        endsNotToCross.some((end) => segmentEntersOutline(from, to, end.bounds, end.outline)),
    );
    const outsideFrame =
        frame !== undefined &&
        edge.waypoints.slice(1, -1).some((point) => !liesWithin(pointBounds(point), frame));
    return (
        !throughHost &&
        !throughEnd &&
        !outsideFrame &&
        endsOffShape(layout, edge).length === 0 &&
        shapesRunThrough(layout, edge, plane).length === 0
    );
}

/** The activities the flow's boundary events sit on, unless the flow ends there too: a route must not cut through them. */
function hostsOfEnds(layout: LayoutModel, ends: FlowEnds): DiagramBounds[] {
    return FLOW_ENDS.flatMap((end) => {
        const node = nodeShapeIn(layout, ends[end].id);
        const host = node === undefined ? undefined : drawnHostOf(layout, node);
        return host === undefined || host.id === ends[otherEndOf(end)].id ? [] : [host.bounds];
    });
}

/**
 * The shapes near the flow a route must go around: not those drawn with an
 * end, nor those of a pool it ends on, which the pool itself walls off.
 */
function obstaclesNear(
    layout: LayoutModel,
    edge: LayoutEdge,
    ends: FlowEnds,
    plane: PlaneNodes | undefined,
    window: DiagramBounds,
): DiagramBounds[] {
    if (plane === undefined) return [];
    const inPoolEnd = (shape: NodeShape) =>
        FLOW_ENDS.some((end) => ends[end].kind === "pool" && shape.pool === ends[end].id);
    return plane.grid
        .indicesNear(window)
        .map((index) => plane.items[index]!)
        .filter((shape) => !isDrawnWithAnEnd(layout, edge, shape) && !inPoolEnd(shape))
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
        const towards = sideOfCenter(shape.bounds, centerOf(ends[otherEndOf(end)].bounds), along);
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
    const horizontal: AxisLine = { axis: "y", at: from.y };
    const vertical: AxisLine = { axis: "x", at: from.x };
    const besideX = spansAlong(bounds, vertical, BESIDE_MARGIN);
    const besideY = spansAlong(bounds, horizontal, BESIDE_MARGIN);
    if (besideY && !besideX) {
        return outlinePointOn(horizontal, bounds, outline, sideOfCenter(bounds, from, "x"));
    }
    if (besideX && !besideY) {
        return outlinePointOn(vertical, bounds, outline, sideOfCenter(bounds, from, "y"));
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
