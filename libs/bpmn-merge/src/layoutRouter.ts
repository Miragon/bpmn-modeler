import {
    type DiagramBounds,
    type Outline,
    type Point,
    centerOf,
    inflated,
    liesInside,
    outlinePointOn,
    segmentEntersBounds,
} from "./layoutGeometry";
import {
    type Segment,
    segmentsCross,
    segmentsOf,
    sharedRunLength,
    withoutRedundantPoints,
} from "./layoutPolyline";

export interface RouteEnd {
    readonly bounds: DiagramBounds;
    readonly outline: Outline;
}

export interface RouteRequest {
    readonly source: RouteEnd;
    readonly target: RouteEnd;
    /** The shapes the route must keep clear of. */
    readonly obstacles: readonly DiagramBounds[];
    /** The other flows nearby: a route pays for crossing one or running along it. */
    readonly otherSegments: readonly Segment[];
}

/** What a route pays besides its length, in pixels of length. */
const ROUTE_COST = { bend: 30, crossing: 40, sharedRunPerPixel: 3 };

/** How far a route keeps from shapes, tried from the roomiest down. */
const CLEARANCES = [15, 8, 3];

/** +x, +y, -x, -y. */
type Direction = 0 | 1 | 2 | 3;
const DIRECTIONS: readonly Direction[] = [0, 1, 2, 3];
const STEPS: readonly Point[] = [
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
];
const reverseOf = (direction: Direction) => ((direction + 2) % 4) as Direction;

/** A point on an end's outline and the direction a route leaves it in. */
interface Port {
    readonly point: Point;
    readonly outward: Direction;
}

/**
 * The cheapest orthogonal route from the source's outline to the target's
 * that keeps clear of the obstacles, or undefined when none is found. A
 * shortest path over the lines through the shapes' sides and ports: each
 * bend, crossing and shared run with another flow costs extra, and equal
 * costs break the same way on every run.
 */
export function routeOrthogonal(request: RouteRequest): Point[] | undefined {
    for (const clearance of CLEARANCES) {
        const route = new RouteGrid(request, clearance).cheapestRoute();
        if (route !== undefined) return route;
    }
    return undefined;
}

/** The route's length with what its bends, crossings and shared runs cost. */
export function routeCost(points: readonly Point[], otherSegments: readonly Segment[]): number {
    return segmentsOf(points).reduce(
        (cost, segment, index) =>
            cost +
            lengthOf(segment) +
            (index > 0 ? ROUTE_COST.bend : 0) +
            penaltyOf(segment, otherSegments),
        0,
    );
}

function lengthOf([from, to]: Segment): number {
    return Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
}

function penaltyOf(segment: Segment, otherSegments: readonly Segment[]): number {
    let penalty = 0;
    for (const other of otherSegments) {
        if (segmentsCross(segment, other)) penalty += ROUTE_COST.crossing;
        penalty += ROUTE_COST.sharedRunPerPixel * sharedRunLength(segment, other);
    }
    return penalty;
}

function portsOf(end: RouteEnd, towards: Point): Port[] {
    const { bounds, outline } = end;
    const center = centerOf(bounds);
    const ports: Port[] = [];
    const add = (point: Point | undefined, outward: Direction) => {
        const known = ports.some((port) => port.point.x === point?.x && port.point.y === point.y);
        if (point !== undefined && !known) ports.push({ point, outward });
    };
    const throughCenter = (axis: "x" | "y") => ({ axis, at: Math.round(center[axis]) });
    add(outlinePointOn(throughCenter("y"), bounds, outline, 1), 0);
    add(outlinePointOn(throughCenter("x"), bounds, outline, 1), 1);
    add(outlinePointOn(throughCenter("y"), bounds, outline, -1), 2);
    add(outlinePointOn(throughCenter("x"), bounds, outline, -1), 3);
    if (outline === "rectangle") {
        // A straight line to the other end where it lies beside this one, off its center.
        const facing = { x: Math.round(towards.x), y: Math.round(towards.y) };
        if (facing.y > bounds.y + 10 && facing.y < bounds.y + bounds.height - 10) {
            add(outlinePointOn({ axis: "y", at: facing.y }, bounds, outline, 1), 0);
            add(outlinePointOn({ axis: "y", at: facing.y }, bounds, outline, -1), 2);
        }
        if (facing.x > bounds.x + 10 && facing.x < bounds.x + bounds.width - 10) {
            add(outlinePointOn({ axis: "x", at: facing.x }, bounds, outline, 1), 1);
            add(outlinePointOn({ axis: "x", at: facing.x }, bounds, outline, -1), 3);
        }
    }
    return ports;
}

/** The lines a route may run on, with the shapes it must keep clear of at one clearance. */
class RouteGrid {
    private readonly xs: readonly number[];
    private readonly ys: readonly number[];
    private readonly sourcePorts = new Map<number, Port>();
    private readonly targetPorts = new Map<number, Port>();
    private readonly blockers: readonly DiagramBounds[];
    private readonly sourceZone: DiagramBounds;
    private readonly targetZone: DiagramBounds;

    constructor(
        private readonly request: RouteRequest,
        clearance: number,
    ) {
        const { source, target, obstacles } = request;
        const sourcePorts = portsOf(source, centerOf(target.bounds));
        const targetPorts = portsOf(target, centerOf(source.bounds));
        const xs = new Set<number>();
        const ys = new Set<number>();
        for (const { point } of [...sourcePorts, ...targetPorts]) {
            xs.add(point.x);
            ys.add(point.y);
        }
        for (const bounds of [...obstacles, source.bounds, target.bounds]) {
            xs.add(Math.round(bounds.x - clearance));
            xs.add(Math.round(bounds.x + bounds.width + clearance));
            ys.add(Math.round(bounds.y - clearance));
            ys.add(Math.round(bounds.y + bounds.height + clearance));
        }
        addLinesBetween(source.bounds, target.bounds, xs, ys);
        this.xs = [...xs].sort((first, second) => first - second);
        this.ys = [...ys].sort((first, second) => first - second);
        for (const port of sourcePorts) this.sourcePorts.set(this.indexOfPoint(port.point), port);
        for (const port of targetPorts) this.targetPorts.set(this.indexOfPoint(port.point), port);
        this.blockers = obstacles.map((bounds) => inflated(bounds, clearance - 1));
        this.sourceZone = inflated(source.bounds, clearance - 1);
        this.targetZone = inflated(target.bounds, clearance - 1);
    }

    cheapestRoute(): Point[] | undefined {
        if (!this.hasOpenPort(this.sourcePorts) || !this.hasOpenPort(this.targetPorts)) {
            return undefined;
        }
        const stateCount = this.xs.length * this.ys.length * DIRECTIONS.length;
        const best = new Float64Array(stateCount).fill(Number.POSITIVE_INFINITY);
        const previous = new Int32Array(stateCount).fill(-1);
        const queue = new StateQueue();
        for (const [index, port] of this.sourcePorts) {
            const state = index * 4 + port.outward;
            best[state] = 0;
            queue.push(0, state);
        }
        while (queue.size > 0) {
            const [cost, state] = queue.pop();
            if (cost > best[state]!) continue;
            if (this.arrives(state)) return this.pointsTo(state, previous);
            for (const [next, step] of this.stepsFrom(state, cost)) {
                if (cost + step < best[next]!) {
                    best[next] = cost + step;
                    previous[next] = state;
                    queue.push(cost + step, next);
                }
            }
        }
        return undefined;
    }

    private arrives(state: number): boolean {
        const index = Math.floor(state / 4);
        const port = this.targetPorts.get(index);
        return (
            port !== undefined &&
            state % 4 === reverseOf(port.outward) &&
            !this.sourcePorts.has(index)
        );
    }

    /** The states one straight run away, to the next usable line in each allowed direction, and their cost. */
    private stepsFrom(state: number, cost: number): [number, number][] {
        const index = Math.floor(state / 4);
        const heading = (state % 4) as Direction;
        const sourcePort = this.sourcePorts.get(index);
        // A target port is entered, never passed through.
        if (this.targetPorts.has(index) && sourcePort === undefined) return [];
        const from = this.pointOf(index);
        const steps: [number, number][] = [];
        for (const direction of DIRECTIONS) {
            if (direction === reverseOf(heading)) continue;
            if (sourcePort !== undefined && cost === 0 && direction !== sourcePort.outward)
                continue;
            const next = this.nextUsable(index, direction, sourcePort !== undefined);
            if (next === undefined) continue;
            const to = this.pointOf(next);
            const segment = [from, to] as const;
            const step =
                lengthOf(segment) +
                (direction === heading ? 0 : ROUTE_COST.bend) +
                penaltyOf(segment, this.request.otherSegments);
            steps.push([next * 4 + direction, step]);
        }
        return steps;
    }

    /**
     * The first line along the direction a run may stop at. A shape stops the
     * run; an end's clearance only keeps it from stopping inside, so a run
     * may still pass on to the port beyond.
     */
    private nextUsable(index: number, direction: Direction, fromSourcePort: boolean) {
        const from = this.pointOf(index);
        let column = index % this.xs.length;
        let row = Math.floor(index / this.xs.length);
        for (;;) {
            column += STEPS[direction]!.x;
            row += STEPS[direction]!.y;
            if (column < 0 || row < 0 || column >= this.xs.length || row >= this.ys.length) {
                return undefined;
            }
            const candidate = row * this.xs.length + column;
            const to = this.pointOf(candidate);
            if (this.hitsShape(from, to)) return undefined;
            const toTargetPort = this.targetPorts.has(candidate);
            if (
                this.isUsable(candidate) &&
                !this.entersClearance(from, to, fromSourcePort, toTargetPort)
            ) {
                return candidate;
            }
        }
    }

    /**
     * Whether a run can leave one of the ports outward: an end whose every
     * port a shape covers has no route, and the search would only learn that
     * after reading the whole grid.
     */
    private hasOpenPort(ports: ReadonlyMap<number, Port>): boolean {
        return [...ports].some(([index, port]) => {
            const from = this.pointOf(index);
            let column = index % this.xs.length;
            let row = Math.floor(index / this.xs.length);
            for (;;) {
                column += STEPS[port.outward]!.x;
                row += STEPS[port.outward]!.y;
                if (column < 0 || row < 0 || column >= this.xs.length || row >= this.ys.length) {
                    return false;
                }
                const candidate = row * this.xs.length + column;
                if (this.hitsShape(from, this.pointOf(candidate))) return false;
                if (this.isUsable(candidate)) return true;
            }
        });
    }

    private isUsable(index: number): boolean {
        if (this.sourcePorts.has(index) || this.targetPorts.has(index)) return true;
        const point = this.pointOf(index);
        return (
            !this.blockers.some((blocker) => liesInside(point, blocker)) &&
            !liesInside(point, this.sourceZone) &&
            !liesInside(point, this.targetZone)
        );
    }

    private hitsShape(from: Point, to: Point): boolean {
        const { source, target } = this.request;
        const enters = (bounds: DiagramBounds) => segmentEntersBounds(from, to, bounds);
        return this.blockers.some(enters) || enters(source.bounds) || enters(target.bounds);
    }

    /** A run may leave the source's clearance only from its port, and enter the target's only to its port. */
    private entersClearance(
        from: Point,
        to: Point,
        fromSourcePort: boolean,
        toTargetPort: boolean,
    ) {
        const enters = (bounds: DiagramBounds) => segmentEntersBounds(from, to, bounds);
        return (
            (!fromSourcePort && enters(this.sourceZone)) ||
            (!toTargetPort && enters(this.targetZone))
        );
    }

    private indexOfPoint(point: Point): number {
        return this.ys.indexOf(point.y) * this.xs.length + this.xs.indexOf(point.x);
    }

    private pointOf(index: number): Point {
        return {
            x: this.xs[index % this.xs.length]!,
            y: this.ys[Math.floor(index / this.xs.length)]!,
        };
    }

    private pointsTo(goal: number, previous: Int32Array): Point[] {
        const points: Point[] = [];
        for (let state = goal; state >= 0; state = previous[state]!) {
            points.unshift(this.pointOf(Math.floor(state / 4)));
        }
        return withoutRedundantPoints(points);
    }
}

/** A line halfway between the ends where they lie apart, so a route can turn between them. */
function addLinesBetween(
    first: DiagramBounds,
    second: DiagramBounds,
    xs: Set<number>,
    ys: Set<number>,
): void {
    for (const [left, right] of [
        [first, second],
        [second, first],
    ] as const) {
        if (left.x + left.width < right.x) xs.add(Math.round((left.x + left.width + right.x) / 2));
        if (left.y + left.height < right.y)
            ys.add(Math.round((left.y + left.height + right.y) / 2));
    }
}

/** A binary min-heap of states by cost; equal costs pop the lower state first, so routes are stable. */
class StateQueue {
    private readonly costs: number[] = [];
    private readonly states: number[] = [];

    get size(): number {
        return this.costs.length;
    }

    push(cost: number, state: number): void {
        this.costs.push(cost);
        this.states.push(state);
        let child = this.costs.length - 1;
        while (child > 0) {
            const parent = (child - 1) >> 1;
            if (!this.precedes(child, parent)) break;
            this.swap(child, parent);
            child = parent;
        }
    }

    pop(): [number, number] {
        const top: [number, number] = [this.costs[0]!, this.states[0]!];
        const lastCost = this.costs.pop()!;
        const lastState = this.states.pop()!;
        if (this.costs.length === 0) return top;
        this.costs[0] = lastCost;
        this.states[0] = lastState;
        let parent = 0;
        for (;;) {
            const left = 2 * parent + 1;
            const right = left + 1;
            let first = parent;
            if (left < this.costs.length && this.precedes(left, first)) first = left;
            if (right < this.costs.length && this.precedes(right, first)) first = right;
            if (first === parent) return top;
            this.swap(parent, first);
            parent = first;
        }
    }

    private precedes(first: number, second: number): boolean {
        const [firstCost, secondCost] = [this.costs[first]!, this.costs[second]!];
        return (
            firstCost < secondCost ||
            (firstCost === secondCost && this.states[first]! < this.states[second]!)
        );
    }

    private swap(first: number, second: number): void {
        [this.costs[first], this.costs[second]] = [this.costs[second]!, this.costs[first]!];
        [this.states[first], this.states[second]] = [this.states[second]!, this.states[first]!];
    }
}
