import { type DiagramBounds, sameBounds } from "./layoutGeometry";
import type { LayoutModel, LayoutShape, NodeShape } from "./layoutModel";

/** Where the layout draws the node's element on the node's plane, at the node's size; undefined when it draws it elsewhere or not at all. */
export function placeOf(layout: LayoutModel, node: NodeShape): DiagramBounds | undefined {
    const drawn = drawingOfSameSize(layout, node);
    return drawn?.kind === "node" && drawn.plane === node.plane ? drawn.bounds : undefined;
}

/** Whether the layout draws the node's element just where the node lies. */
export function drawsAt(layout: LayoutModel, node: NodeShape): boolean {
    const place = placeOf(layout, node);
    return place !== undefined && sameBounds(place, node.bounds);
}

/**
 * The layout's drawing of the shape's element at the shape's size, on any
 * plane: a layout that draws a sub-process collapsed draws its contents on
 * the sub-process's own plane.
 */
export function drawingOfSameSize(
    layout: LayoutModel,
    shape: LayoutShape,
): LayoutShape | undefined {
    const drawn = layout.shapes.get(shape.id);
    const sameSize =
        drawn !== undefined &&
        drawn.bounds.width === shape.bounds.width &&
        drawn.bounds.height === shape.bounds.height;
    return sameSize ? drawn : undefined;
}

/** Whether the layout draws the shape's element just where the shape lies, on any plane. */
export function drawsWhereItLies(layout: LayoutModel, shape: LayoutShape): boolean {
    const drawn = drawingOfSameSize(layout, shape);
    return drawn !== undefined && sameBounds(drawn.bounds, shape.bounds);
}

/** A shape the build placed: not both sides draw it just where the result does; a boundary event goes with its host. */
export function placedByBuild(node: NodeShape, sides: readonly LayoutModel[]): boolean {
    return node.host === undefined && !sides.every((side) => drawsAt(side, node));
}

/**
 * Whether the build placed the node outside those frames: it placed the node,
 * or a frame lies where no side draws it, as a lane the build stacked does.
 */
export function placedByBuildOutside(
    node: NodeShape,
    frames: readonly LayoutShape[],
    sides: readonly LayoutModel[],
): boolean {
    const drawnByNoSide = (frame: LayoutShape) =>
        sides.every((side) => !drawsWhereItLies(side, frame));
    return placedByBuild(node, sides) || (node.host === undefined && frames.some(drawnByNoSide));
}
