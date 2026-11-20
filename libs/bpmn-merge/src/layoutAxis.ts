import {
    type Border,
    type DiagramBounds,
    type Outline,
    type Point,
    bottomOf,
    centerOf,
    rightOf,
    translated,
} from "./layoutGeometry";

/** A direction through the diagram: along x room is made to the right, along y downward. */
export type Axis = "x" | "y";

export const crossAxisOf = (axis: Axis): Axis => (axis === "x" ? "y" : "x");

export const along = (axis: Axis, point: Point): number => (axis === "x" ? point.x : point.y);

export const across = (axis: Axis, point: Point): number => (axis === "x" ? point.y : point.x);

/** The point moved across the axis to `at`. */
export function atAcross(axis: Axis, point: Point, at: number): Point {
    return axis === "x" ? { x: point.x, y: at } : { x: at, y: point.y };
}

/** Where the bounds start along the axis. */
export const nearSideOf = (axis: Axis, bounds: DiagramBounds): number =>
    axis === "x" ? bounds.x : bounds.y;

/** Where the bounds end along the axis. */
export const farSideOf = (axis: Axis, bounds: DiagramBounds): number =>
    axis === "x" ? rightOf(bounds) : bottomOf(bounds);

/** The border at the bounds' far side along the axis. */
export const farBorderOf = (axis: Axis): Border => (axis === "x" ? "right" : "bottom");

export function offsetAlong(axis: Axis, by: number): { readonly dx: number; readonly dy: number } {
    return axis === "x" ? { dx: by, dy: 0 } : { dx: 0, dy: by };
}

export function pointShifted(axis: Axis, point: Point, by: number): Point {
    const { dx, dy } = offsetAlong(axis, by);
    return { x: point.x + dx, y: point.y + dy };
}

export function boundsShifted(axis: Axis, bounds: DiagramBounds, by: number): DiagramBounds {
    const { dx, dy } = offsetAlong(axis, by);
    return translated(bounds, dx, dy);
}

/** The bounds grown at their far side along the axis. */
export function grownAlong(axis: Axis, bounds: DiagramBounds, by: number): DiagramBounds {
    return axis === "x"
        ? { ...bounds, width: bounds.width + by }
        : { ...bounds, height: bounds.height + by };
}

/**
 * Whether the other lies across from the bounds along the axis, overlapping
 * their span across it, and reaches into them or starts less than the
 * clearance past their far side.
 */
export function liesAheadWithin(
    axis: Axis,
    bounds: DiagramBounds,
    other: DiagramBounds,
    clearance: number,
): boolean {
    const crossAxis = crossAxisOf(axis);
    const overlapsAcross =
        nearSideOf(crossAxis, other) < farSideOf(crossAxis, bounds) &&
        nearSideOf(crossAxis, bounds) < farSideOf(crossAxis, other);
    return (
        overlapsAcross &&
        nearSideOf(axis, other) < farSideOf(axis, bounds) + clearance &&
        nearSideOf(axis, bounds) < farSideOf(axis, other)
    );
}

/** The part bounds grown by `growth` along the axis gain past their far side. */
export function stripPast(axis: Axis, bounds: DiagramBounds, growth: number): DiagramBounds {
    return axis === "x"
        ? { ...bounds, x: rightOf(bounds), width: growth }
        : { ...bounds, y: bottomOf(bounds), height: growth };
}

/** A horizontal (`y`) or vertical (`x`) line through the diagram. */
export interface AxisLine {
    readonly axis: Axis;
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
    const halfAcross = horizontal ? bounds.height / 2 : bounds.width / 2;
    const halfAlong = horizontal ? bounds.width / 2 : bounds.height / 2;
    const offset = line.at - (horizontal ? center.y : center.x);
    const reach = reachAlong(outline, halfAlong, halfAcross, Math.abs(offset));
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

/** The line both points lie on, horizontal first; undefined when they share neither. */
export function lineThrough(from: Point, to: Point): AxisLine | undefined {
    if (from.y === to.y) return { axis: "y", at: from.y };
    if (from.x === to.x) return { axis: "x", at: from.x };
    return undefined;
}

/** Whether the line crosses the bounds at least `margin` away from their corners. */
export function spansAlong(bounds: DiagramBounds, line: AxisLine, margin: number): boolean {
    const [low, high] =
        line.axis === "y" ? [bounds.y, bottomOf(bounds)] : [bounds.x, rightOf(bounds)];
    return line.at > low + margin && line.at < high - margin;
}

/** Which side of the bounds' center the point lies on along the line, as `outlinePointOn` takes `towards`. */
export function sideOfCenter(bounds: DiagramBounds, point: Point, line: AxisLine): 1 | -1 {
    const axis = crossAxisOf(line.axis);
    return point[axis] > centerOf(bounds)[axis] ? 1 : -1;
}
