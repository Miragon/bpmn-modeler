export interface DiagramBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface Point {
    readonly x: number;
    readonly y: number;
}

/** The outline bpmn-js draws a shape with: a circle for an event, a diamond for a gateway. */
export type Outline = "circle" | "diamond" | "rectangle";

/** How far, in pixels, a drawing may miss an outline or a frame, as the modeler rounds its docking points. */
const LAYOUT_TOLERANCE = 3;

const rightOf = (bounds: DiagramBounds) => bounds.x + bounds.width;
const bottomOf = (bounds: DiagramBounds) => bounds.y + bounds.height;

export function centerOf(bounds: DiagramBounds): Point {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** The point's distance to the outline: negative inside, positive outside. */
function outlineDistance(point: Point, bounds: DiagramBounds, outline: Outline): number {
    const center = centerOf(bounds);
    const halfWidth = bounds.width / 2;
    const halfHeight = bounds.height / 2;
    const dx = Math.abs(point.x - center.x);
    const dy = Math.abs(point.y - center.y);
    if (outline === "circle") return Math.hypot(dx, dy) - Math.min(halfWidth, halfHeight);
    if (outline === "diamond") {
        const edgeLength = Math.hypot(halfWidth, halfHeight);
        return (dx / halfWidth + dy / halfHeight - 1) * ((halfWidth * halfHeight) / edgeLength);
    }
    const outsideX = dx - halfWidth;
    const outsideY = dy - halfHeight;
    if (outsideX > 0 || outsideY > 0) {
        return Math.hypot(Math.max(outsideX, 0), Math.max(outsideY, 0));
    }
    return Math.max(outsideX, outsideY);
}

/** Which side of the outline a point lies on when it misses it by more than the tolerance. */
export type OutlineMiss = "inside" | "outside";

export function outlineMissOf(
    point: Point,
    bounds: DiagramBounds,
    outline: Outline,
): OutlineMiss | undefined {
    const distance = outlineDistance(point, bounds, outline);
    if (Math.abs(distance) <= LAYOUT_TOLERANCE) return undefined;
    return distance > 0 ? "outside" : "inside";
}

/** Whether the two overlap by more than the tolerance in both directions, not merely touch. */
export function overlapsBeyondTolerance(first: DiagramBounds, second: DiagramBounds): boolean {
    const width = Math.min(rightOf(first), rightOf(second)) - Math.max(first.x, second.x);
    const height = Math.min(bottomOf(first), bottomOf(second)) - Math.max(first.y, second.y);
    return width > LAYOUT_TOLERANCE && height > LAYOUT_TOLERANCE;
}

/** Whether `inner` lies inside `frame`, give or take the tolerance. */
export function liesWithin(inner: DiagramBounds, frame: DiagramBounds): boolean {
    return (
        inner.x >= frame.x - LAYOUT_TOLERANCE &&
        inner.y >= frame.y - LAYOUT_TOLERANCE &&
        rightOf(inner) <= rightOf(frame) + LAYOUT_TOLERANCE &&
        bottomOf(inner) <= bottomOf(frame) + LAYOUT_TOLERANCE
    );
}

export function pointBounds(point: Point): DiagramBounds {
    return { x: point.x, y: point.y, width: 0, height: 0 };
}

/** The segment's bounding box. */
export function segmentBounds(from: Point, to: Point): DiagramBounds {
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    return { x, y, width: Math.abs(to.x - from.x), height: Math.abs(to.y - from.y) };
}

/**
 * Whether the segment enters the shape deeper than the tolerance, so a flow
 * running along the outline does not count.
 */
export function segmentEntersShape(from: Point, to: Point, bounds: DiagramBounds): boolean {
    return segmentEntersBounds(from, to, inflated(bounds, -LAYOUT_TOLERANCE));
}

/** Whether the segment enters the open inside of the bounds (Liang-Barsky clipping). */
export function segmentEntersBounds(from: Point, to: Point, bounds: DiagramBounds): boolean {
    if (bounds.width <= 0 || bounds.height <= 0) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let enter = 0;
    let leave = 1;
    for (const [direction, room] of [
        [-dx, from.x - bounds.x],
        [dx, rightOf(bounds) - from.x],
        [-dy, from.y - bounds.y],
        [dy, bottomOf(bounds) - from.y],
    ] as const) {
        if (direction === 0) {
            if (room <= 0) return false;
            continue;
        }
        const at = room / direction;
        if (direction < 0) enter = Math.max(enter, at);
        else leave = Math.min(leave, at);
        if (enter >= leave) return false;
    }
    return true;
}

/** The bounds grown by `by` on every side, shrunk for a negative `by`. */
export function inflated(bounds: DiagramBounds, by: number): DiagramBounds {
    return {
        x: bounds.x - by,
        y: bounds.y - by,
        width: bounds.width + 2 * by,
        height: bounds.height + 2 * by,
    };
}

/** The smallest bounds holding all of them. */
export function boundsAround(all: readonly DiagramBounds[]): DiagramBounds {
    const left = Math.min(...all.map(({ x }) => x));
    const top = Math.min(...all.map(({ y }) => y));
    const right = Math.max(...all.map(rightOf));
    const bottom = Math.max(...all.map(bottomOf));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Whether the point lies strictly inside the bounds. */
export function liesInside(point: Point, bounds: DiagramBounds): boolean {
    return (
        point.x > bounds.x &&
        point.x < rightOf(bounds) &&
        point.y > bounds.y &&
        point.y < bottomOf(bounds)
    );
}

/** A horizontal (`y`) or vertical (`x`) line through the diagram. */
export interface AxisLine {
    readonly axis: "x" | "y";
    readonly at: number;
}

/**
 * Where the line meets the outline on the side `towards` of the center: a
 * horizontal line on the right for +1, a vertical one at the bottom for +1.
 * Rounded to whole pixels, as the modeler docks; undefined when the line misses.
 */
export function outlinePointOn(
    line: AxisLine,
    bounds: DiagramBounds,
    outline: Outline,
    towards: 1 | -1,
): Point | undefined {
    const center = centerOf(bounds);
    const horizontal = line.axis === "y";
    const across = horizontal ? bounds.height / 2 : bounds.width / 2;
    const along = horizontal ? bounds.width / 2 : bounds.height / 2;
    const offset = line.at - (horizontal ? center.y : center.x);
    const reach = reachAlong(outline, along, across, Math.abs(offset));
    if (reach === undefined) return undefined;
    const end = Math.round((horizontal ? center.x : center.y) + towards * reach);
    return horizontal ? { x: end, y: line.at } : { x: line.at, y: end };
}

/** How far from the center the outline lies along a line `offset` away from it. */
function reachAlong(
    outline: Outline,
    halfAlong: number,
    halfAcross: number,
    offset: number,
): number | undefined {
    if (offset > halfAcross) return undefined;
    if (outline === "circle") {
        const radius = Math.min(halfAlong, halfAcross);
        return offset > radius ? undefined : Math.sqrt(radius * radius - offset * offset);
    }
    if (outline === "diamond") return halfAlong * (1 - offset / halfAcross);
    return halfAlong;
}
