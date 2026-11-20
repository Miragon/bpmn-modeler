import type { PolylinePoint } from "@miragon/bpmn-modeler-types/polyline";

export interface DiagramBounds {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export type Point = PolylinePoint;

export interface Offset {
    readonly dx: number;
    readonly dy: number;
}

export const offsetLength = ({ dx, dy }: Offset): number => Math.abs(dx) + Math.abs(dy);

export function offsetBetween(from: DiagramBounds, to: DiagramBounds): Offset {
    return { dx: to.x - from.x, dy: to.y - from.y };
}

/** The outline bpmn-js draws a shape with: a circle for an event, a diamond for a gateway. */
export type Outline = "circle" | "diamond" | "rectangle";

/** How far, in pixels, a drawing may miss an outline or a frame, as the modeler rounds its docking points. */
export const LAYOUT_TOLERANCE = 3;

export const rightOf = (bounds: DiagramBounds) => bounds.x + bounds.width;
export const bottomOf = (bounds: DiagramBounds) => bounds.y + bounds.height;

export function centerOf(bounds: DiagramBounds): Point {
    return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

/** The point's distance to the outline: negative inside, positive outside. */
export function outlineDistance(point: Point, bounds: DiagramBounds, outline: Outline): number {
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

/** The bounds grown by `by` on every side, shrunk for a negative `by`. */
export function inflated(bounds: DiagramBounds, by: number): DiagramBounds {
    return {
        x: bounds.x - by,
        y: bounds.y - by,
        width: bounds.width + 2 * by,
        height: bounds.height + 2 * by,
    };
}

export function translated(bounds: DiagramBounds, dx: number, dy: number): DiagramBounds {
    return { ...bounds, x: bounds.x + dx, y: bounds.y + dy };
}

export function sameBounds(first: DiagramBounds, second: DiagramBounds): boolean {
    return (
        first.x === second.x &&
        first.y === second.y &&
        first.width === second.width &&
        first.height === second.height
    );
}

/** Whether the two lie at least `clearance` apart along one axis. */
export function keepsClearOf(
    first: DiagramBounds,
    second: DiagramBounds,
    clearance: number,
): boolean {
    return (
        first.x >= rightOf(second) + clearance ||
        second.x >= rightOf(first) + clearance ||
        first.y >= bottomOf(second) + clearance ||
        second.y >= bottomOf(first) + clearance
    );
}

export type Border = "left" | "right" | "top" | "bottom";

/** The borders of the bounds the point lies on, give or take the tolerance; two at a corner. */
export function bordersAt(point: Point, bounds: DiagramBounds): Border[] {
    const near = (value: number, line: number) => Math.abs(value - line) <= LAYOUT_TOLERANCE;
    const alongX =
        point.x >= bounds.x - LAYOUT_TOLERANCE && point.x <= rightOf(bounds) + LAYOUT_TOLERANCE;
    const alongY =
        point.y >= bounds.y - LAYOUT_TOLERANCE && point.y <= bottomOf(bounds) + LAYOUT_TOLERANCE;
    const borders: [Border, boolean][] = [
        ["left", alongY && near(point.x, bounds.x)],
        ["right", alongY && near(point.x, rightOf(bounds))],
        ["top", alongX && near(point.y, bounds.y)],
        ["bottom", alongX && near(point.y, bottomOf(bounds))],
    ];
    return borders.flatMap(([border, on]) => (on ? [border] : []));
}

/** The smallest bounds holding all of them. */
export function boundsAround(all: readonly DiagramBounds[]): DiagramBounds {
    const left = Math.min(...all.map(({ x }) => x));
    const top = Math.min(...all.map(({ y }) => y));
    const right = Math.max(...all.map(rightOf));
    const bottom = Math.max(...all.map(bottomOf));
    return { x: left, y: top, width: right - left, height: bottom - top };
}

/** How much of the bounds' area lies outside the frame. */
export function areaOutside(bounds: DiagramBounds, frame: DiagramBounds): number {
    const width = Math.max(
        0,
        Math.min(rightOf(bounds), rightOf(frame)) - Math.max(bounds.x, frame.x),
    );
    const height = Math.max(
        0,
        Math.min(bottomOf(bounds), bottomOf(frame)) - Math.max(bounds.y, frame.y),
    );
    return bounds.width * bounds.height - width * height;
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

/** The shortest orthogonal distance between the two, zero where they overlap: no route between them is shorter. */
export function gapBetween(first: DiagramBounds, second: DiagramBounds): number {
    const apartX = Math.max(0, second.x - rightOf(first), first.x - rightOf(second));
    const apartY = Math.max(0, second.y - bottomOf(first), first.y - bottomOf(second));
    return apartX + apartY;
}

/**
 * Where bpmn-js moves an external label when its element's bounds change:
 * by as far as the border point nearest the label's middle moves as the
 * bounds scale about their center.
 */
export function labelAfterResize(
    label: DiagramBounds,
    from: DiagramBounds,
    to: DiagramBounds,
): DiagramBounds {
    const reference = nearestBorderPoint(centerOf(label), from);
    const oldCenter = centerOf(from);
    const newCenter = centerOf(to);
    const moved = (at: number, center: number, newCenterAt: number, scale: number) =>
        Math.round(Math.round(newCenterAt + (at - center) * scale) - at);
    const dx = moved(reference.x, oldCenter.x, newCenter.x, scaleOf(to.width, from.width));
    const dy = moved(reference.y, oldCenter.y, newCenter.y, scaleOf(to.height, from.height));
    return translated(label, dx, dy);
}

function scaleOf(size: number, drawn: number): number {
    return drawn === 0 ? 1 : size / drawn;
}

function nearestBorderPoint(point: Point, bounds: DiagramBounds): Point {
    const clamped = (at: number, start: number, end: number) => Math.min(Math.max(at, start), end);
    if (!liesInside(point, bounds)) {
        return {
            x: clamped(point.x, bounds.x, rightOf(bounds)),
            y: clamped(point.y, bounds.y, bottomOf(bounds)),
        };
    }
    const onBorders: [number, Point][] = [
        [point.y - bounds.y, { x: point.x, y: bounds.y }],
        [rightOf(bounds) - point.x, { x: rightOf(bounds), y: point.y }],
        [bottomOf(bounds) - point.y, { x: point.x, y: bottomOf(bounds) }],
        [point.x - bounds.x, { x: bounds.x, y: point.y }],
    ];
    return onBorders.reduce((nearest, next) => (next[0] < nearest[0] ? next : nearest))[1];
}
