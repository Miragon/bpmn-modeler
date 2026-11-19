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
export const LAYOUT_TOLERANCE = 3;

const rightOf = (bounds: DiagramBounds) => bounds.x + bounds.width;
const bottomOf = (bounds: DiagramBounds) => bounds.y + bounds.height;

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
 * running along the outline does not count (Liang-Barsky clipping).
 */
export function segmentEntersShape(from: Point, to: Point, bounds: DiagramBounds): boolean {
    const left = bounds.x + LAYOUT_TOLERANCE;
    const top = bounds.y + LAYOUT_TOLERANCE;
    const right = rightOf(bounds) - LAYOUT_TOLERANCE;
    const bottom = bottomOf(bounds) - LAYOUT_TOLERANCE;
    if (left >= right || top >= bottom) return false;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    let enter = 0;
    let leave = 1;
    for (const [direction, room] of [
        [-dx, from.x - left],
        [dx, right - from.x],
        [-dy, from.y - top],
        [dy, bottom - from.y],
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
