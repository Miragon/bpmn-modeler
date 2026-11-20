import { DrawingDraft } from "./layoutDrawingDraft";
import {
    type DiagramBounds,
    type Point,
    boundsAround,
    centerOf,
    gapBetween,
    inflated,
    liesWithin,
    overlapsBeyondTolerance,
    pointBounds,
} from "./layoutGeometry";
import { keptRoute } from "./layoutKeptRoute";
import {
    FLOW_ENDS,
    type FlowEnds,
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
import { type PlaneNodes, planeNodesOf } from "./layoutPlanes";
import { isOrthogonal, nearestPointOn, polylineBounds, segmentsOf } from "./layoutPolyline";
import { routeCost, routeOrthogonal } from "./layoutRouter";
import { type Segment, segmentEntersOutline, segmentEntersShape } from "./layoutSegments";
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

/** How the build plans the repair of the flows the spots name. */
export type FlowRepairPlanner = (layout: LayoutModel, spots: readonly LayoutSpot[]) => FlowRepair[];

/** How far around a flow's ends and waypoints the router looks for shapes, tried from the nearest out. */
const OBSTACLE_WINDOW_MARGINS = [120, 360] as const;

/** How much longer, in pixels of route cost, a flow's own bends may be than a fresh route and still be kept. */
const KEPT_ROUTE_ALLOWANCE = 40;

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
    const repairedSoFar = DrawingDraft.of(layout);
    return flows.map((id): FlowRepair => {
        const edge = layout.edges.get(id);
        if (edge === undefined) return { kind: "notRepaired", flow: id };
        const repair = repairOf(layout, edge, planes.get(edge.plane), repairedSoFar);
        if (repair.kind === "movedByBuild") {
            repairedSoFar.replaceEdge({ ...edge, waypoints: repair.waypoints });
        }
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

function repairOf(
    layout: LayoutModel,
    edge: LayoutEdge,
    plane: PlaneNodes | undefined,
    repairedSoFar: DrawingDraft,
): FlowRepair {
    const source = endShapeOf(layout, edge, "source");
    const target = endShapeOf(layout, edge, "target");
    if (source === undefined || target === undefined || edge.waypoints.length < 2) {
        return { kind: "notRepaired", flow: edge.id };
    }
    const ends = { source, target };
    const route = new RepairRoutes(layout, edge, ends, plane, repairedSoFar).chosenRoute();
    return route === undefined ? { kind: "notRepaired", flow: edge.id } : movedByBuild(edge, route);
}

/** Whether a flow keeps its own bends over another route: they may cost up to the allowance more. */
function keepsOwnBends(ownBendsCost: number, otherRouteCost: number): boolean {
    return ownBendsCost <= otherRouteCost + KEPT_ROUTE_ALLOWANCE;
}

/**
 * The routes one flow may be repaired onto, its own bends docked again or a
 * fresh route in a window around it, and the bounds both must keep to: the
 * hosts of its boundary events, its ends and the frame both ends lie in.
 */
class RepairRoutes {
    private readonly hosts: readonly DiagramBounds[];
    /** The ends a route must not run back through; none when one lies on the other. */
    private readonly endsNotToCross: readonly LayoutShape[];
    private readonly frame: DiagramBounds | undefined;

    constructor(
        private readonly layout: LayoutModel,
        private readonly edge: LayoutEdge,
        private readonly ends: FlowEnds,
        private readonly plane: PlaneNodes | undefined,
        /** The drawing with the flows repaired before this one on their new routes. */
        private readonly repairedSoFar: DrawingDraft,
    ) {
        const { source, target } = ends;
        const sharedFrame = sharedFrameOf(layout, edge);
        // Grown to hold both ends, as the merge may have moved one out of the frame.
        this.frame =
            sharedFrame && boundsAround([sharedFrame.bounds, source.bounds, target.bounds]);
        this.hosts = hostsOfEnds(layout, ends);
        this.endsNotToCross = overlapsBeyondTolerance(source.bounds, target.bounds)
            ? []
            : [source, target];
    }

    /**
     * The flow's own bends where they fit, unless a fresh route in the nearest
     * window costs more than the allowance less; else a fresh route from the
     * nearest window that holds one.
     */
    chosenRoute(): Point[] | undefined {
        const ownBends = this.ownBends();
        return ownBends === undefined
            ? this.routedInWideningWindow()
            : this.ownBendsUnlessRoutedIsCheaper(ownBends);
    }

    /** The flow's own bends with its ends docked again, when they fit and run orthogonally. */
    private ownBends(): Point[] | undefined {
        const kept = keptRoute(this.layout, this.edge, this.ends);
        return this.fits(kept) && isOrthogonal(kept) ? kept : undefined;
    }

    /** The own bends, unless a fresh route in the nearest window fits and costs more than the allowance less. */
    private ownBendsUnlessRoutedIsCheaper(ownBends: Point[]): Point[] {
        const window = this.windowOf(OBSTACLE_WINDOW_MARGINS[0]);
        const otherSegments = this.otherSegmentsNear(window);
        const ownBendsCost = routeCost(ownBends, otherSegments);
        const { source, target } = this.ends;
        // No route is shorter than the gap between the ends, so none could beat the own bends.
        if (keepsOwnBends(ownBendsCost, gapBetween(source.bounds, target.bounds))) return ownBends;
        const routed = this.routedIn(window, otherSegments);
        return routed === undefined || keepsOwnBends(ownBendsCost, routeCost(routed, otherSegments))
            ? ownBends
            : routed;
    }

    /** A fresh route that fits, from the nearest window around the flow that holds one. */
    private routedInWideningWindow(): Point[] | undefined {
        for (const margin of OBSTACLE_WINDOW_MARGINS) {
            const window = this.windowOf(margin);
            const routed = this.routedIn(window, this.otherSegmentsNear(window));
            if (routed !== undefined) return routed;
        }
        return undefined;
    }

    private routedIn(
        window: DiagramBounds,
        otherSegments: readonly Segment[],
    ): Point[] | undefined {
        const routed = routeOrthogonal({
            ...this.ends,
            obstacles: [...this.obstaclesNear(window), ...this.hosts],
            otherSegments,
            ...(this.frame === undefined ? {} : { frame: this.frame }),
        });
        return this.fits(routed) ? routed : undefined;
    }

    /** The segments of the other flows on the plane, as repaired so far, whose drawing meets the window. */
    private otherSegmentsNear(window: DiagramBounds): Segment[] {
        return this.repairedSoFar
            .edgesNear(this.edge.plane, window)
            .filter(({ id }) => id !== this.edge.id)
            .flatMap(({ waypoints }) => segmentsOf(waypoints));
    }

    private windowOf(margin: number): DiagramBounds {
        const { source, target } = this.ends;
        const drawn = [source.bounds, target.bounds, polylineBounds(this.edge.waypoints)];
        return inflated(boundsAround(drawn), margin);
    }

    /**
     * Whether the route meets both the flow's shapes, runs through no shape,
     * nor through an end's host or back through an end, and bends only inside
     * its frame.
     */
    private fits(points: readonly Point[] | undefined): points is Point[] {
        if (points === undefined) return false;
        const { frame } = this;
        const segments = segmentsOf(points);
        const throughHost = segments.some((segment) =>
            this.hosts.some((host) => segmentEntersShape(segment, host)),
        );
        const throughEnd = segments.some((segment) =>
            this.endsNotToCross.some((end) =>
                segmentEntersOutline(segment, end.bounds, end.outline),
            ),
        );
        const outsideFrame =
            frame !== undefined &&
            points.slice(1, -1).some((point) => !liesWithin(pointBounds(point), frame));
        const route = { ...this.edge, waypoints: points };
        return (
            !throughHost &&
            !throughEnd &&
            !outsideFrame &&
            endsOffShape(this.layout, route).length === 0 &&
            shapesRunThrough(this.layout, route, this.plane).length === 0
        );
    }

    /**
     * The shapes near the flow a route must go around: not those drawn with an
     * end, nor those of a pool it ends on, which the pool itself walls off.
     */
    private obstaclesNear(window: DiagramBounds): DiagramBounds[] {
        const { plane, ends } = this;
        if (plane === undefined) return [];
        const inPoolEnd = (shape: NodeShape) =>
            FLOW_ENDS.some((end) => ends[end].kind === "pool" && shape.pool === ends[end].id);
        return plane.grid
            .indicesNear(window)
            .map((index) => plane.items[index]!)
            .filter(
                (shape) => !isDrawnWithAnEnd(this.layout, this.edge, shape) && !inPoolEnd(shape),
            )
            .map(({ bounds }) => bounds);
    }
}

/** The activities the flow's boundary events sit on, unless the flow ends there too: a route must not cut through them. */
function hostsOfEnds(layout: LayoutModel, ends: FlowEnds): DiagramBounds[] {
    return FLOW_ENDS.flatMap((end) => {
        const node = nodeShapeIn(layout, ends[end].id);
        const host = node === undefined ? undefined : drawnHostOf(layout, node);
        return host === undefined || host.id === ends[otherEndOf(end)].id ? [] : [host.bounds];
    });
}

function movedByBuild(edge: LayoutEdge, waypoints: Point[]): FlowRepair {
    const repair = { kind: "movedByBuild", flow: edge.id, waypoints } as const;
    return edge.label === undefined
        ? repair
        : { ...repair, label: followingLabel(edge.label, edge.waypoints, waypoints) };
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
