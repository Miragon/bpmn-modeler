import { DrawingDraft } from "./layoutDrawingDraft";
import { type DiagramBounds, bottomOf, centerOf, liesWithin, rightOf } from "./layoutGeometry";
import { FlowTopology } from "./layoutFlowTopology";
import { growFrameFor } from "./layoutGrowFrame";
import type { RoomContext } from "./layoutMakeRoom";
import { type LayoutModel, type LayoutShape, frameIdsOf, nodeShapeIn } from "./layoutModel";
import { drawingOfSameSize, drawsWhereItLies, placedByBuildOutside } from "./sideDrawings";
import { type ShapeGroup, ShapeGroups, groupShapesBoundsIn } from "./layoutShapeGroups";
import { type Offset, Placement, innerBoundsOf, offsetBetween } from "./layoutShapePlacement";
import type { ContainerRepair, SpotRepair } from "./layoutSpotRepairs";
import { type LayoutSpot, liesOutside } from "./layoutSpots";

export interface ContainerMovePlan {
    /** The drawing with every repair applied; the input itself when nothing changed. */
    readonly layout: LayoutModel;
    /**
     * One per spot of a shape outside its container, in the spots' order, then
     * one per overlap of the spots a repair moved or shifted a shape of, which
     * may have left the shape it lay on.
     */
    readonly repairs: readonly SpotRepair[];
}

const NOT_REPAIRED: ContainerRepair = { kind: "notRepaired" };

/**
 * Brings every shape the build placed outside its containers that the spots
 * name back inside, with its label, boundary events and contents: a shape it
 * placed, or one in a frame no side draws where it lies, such as a lane it
 * stacked. Never a shape both sides draw where it lies in a frame a side draws
 * there, nor a boundary event on its own,
 * which stays on its host. It moves the shape as the side that drew
 * it moved the container, or a sibling in that container, when the place is
 * free; else to the nearest free place inside; else grows the sub-process or
 * pool to hold it where it lies. A lane is never grown: a shape goes into its
 * lane's band only where the band holds it.
 */
export function planContainerMoves(
    layout: LayoutModel,
    spots: readonly LayoutSpot[],
    sides: readonly LayoutModel[],
): ContainerMovePlan {
    const outside = spots.flatMap((spot) => (spot.kind === "shapeOutsideContainer" ? [spot] : []));
    if (outside.length === 0) return { layout, repairs: [] };
    const repairer = new ContainerRepairer(layout, sides);
    const repairs = new Map<string, ContainerRepair>();
    for (const id of outermostShapesFirst(
        layout,
        outside.map(({ shape }) => shape),
    )) {
        const containers = outside
            .filter(({ shape }) => shape === id)
            .map((spot) => spot.container);
        repairs.set(id, repairer.repair(id, containers));
    }
    return {
        layout: repairer.layout,
        repairs: [
            ...outside.map((spot) => ({ spot, repair: repairs.get(spot.shape) ?? NOT_REPAIRED })),
            ...overlapsMovedOff(spots, repairer.movedShapes),
        ],
    };
}

/** The overlaps of the spots one of whose shapes a repair moved, named after the first such shape of the pair. */
function overlapsMovedOff(
    spots: readonly LayoutSpot[],
    movedShapes: readonly string[],
): SpotRepair[] {
    return spots.flatMap((spot) => {
        if (spot.kind !== "shapesOverlap") return [];
        const moved = spot.shapes.find((id) => movedShapes.includes(id));
        return moved === undefined ? [] : [{ spot, repair: { kind: "movedByBuild", moved } }];
    });
}

/** Brings shapes into their containers one after another, on a draft of the drawing. */
class ContainerRepairer {
    private readonly groups: ShapeGroups;
    private readonly room: RoomContext;
    private draft: DrawingDraft;
    /** The repair that changed each shape so far. */
    private readonly changes = new Map<string, ContainerRepair>();
    readonly movedShapes: string[] = [];

    constructor(
        private readonly original: LayoutModel,
        private readonly sides: readonly LayoutModel[],
    ) {
        this.groups = new ShapeGroups(original);
        this.room = { groups: this.groups, topology: new FlowTopology(original) };
        this.draft = DrawingDraft.of(original);
    }

    get layout(): LayoutModel {
        return this.draft.changed ? this.draft : this.original;
    }

    /** Brings the shape inside those of the containers it still lies outside. */
    repair(id: string, containers: readonly string[]): ContainerRepair {
        const { draft } = this;
        const node = draft.node(id);
        if (node === undefined) return NOT_REPAIRED;
        const frames = containers.flatMap((container) => {
            const frame = draft.shapes.get(container);
            return frame !== undefined && liesOutside(node, frame) ? [frame] : [];
        });
        if (frames.length === 0) return resolvedEarlier(id, containers, this.changes);
        if (!placedByBuildOutside(node, frames, this.sides)) return NOT_REPAIRED;
        const group = this.groups.of(draft, node);
        const move =
            sidesMove(draft, group, frames, this.sides) ?? nearestPlaceInside(draft, group, frames);
        if (move !== undefined) {
            draft.translate(group, move.dx, move.dy);
            const repair: ContainerRepair = { kind: "movedIntoContainer" };
            for (const member of group.members) this.changes.set(member, repair);
            this.movedShapes.push(...group.members);
            return repair;
        }
        const grown = growFrameFor(draft, this.room, group, frames);
        if (grown === undefined) return NOT_REPAIRED;
        const repair: ContainerRepair =
            grown.shifted.length === 0
                ? { kind: "grewContainer" }
                : { kind: "grewContainerAndShifted", shifted: grown.shifted };
        for (const [changed, shape] of grown.draft.shapes) {
            if (draft.shapes.get(changed) !== shape) this.changes.set(changed, repair);
        }
        this.movedShapes.push(...grown.moved);
        this.draft = grown.draft;
        return repair;
    }
}

/** The shapes, each once, those of fewer sub-processes first and a boundary event after its host, as moving one carries what it holds. */
function outermostShapesFirst(layout: LayoutModel, ids: readonly string[]): string[] {
    const depthOf = (id: string) => {
        const node = nodeShapeIn(layout, id);
        return node === undefined
            ? 0
            : node.subProcesses.length * 2 + (node.host === undefined ? 0 : 1);
    };
    return [...new Set(ids)].sort((first, second) => depthOf(first) - depthOf(second));
}

/** The repair that brought the shape inside on its way: one that moved it, else one that grew a container of it. */
function resolvedEarlier(
    id: string,
    containers: readonly string[],
    changes: ReadonlyMap<string, ContainerRepair>,
): ContainerRepair {
    return (
        changes.get(id) ??
        containers
            .map((container) => changes.get(container))
            .find((repair) => repair !== undefined) ??
        NOT_REPAIRED
    );
}

/**
 * The first free place among the moves of the sides that draw the node where
 * it lies: as such a side's drawing of a container lies from the result's,
 * then as its drawing of a sibling in that container does, nearest sibling first.
 */
function sidesMove(
    draft: DrawingDraft,
    group: ShapeGroup,
    frames: readonly LayoutShape[],
    sides: readonly LayoutModel[],
): Offset | undefined {
    const { node } = group;
    const members = new Set(group.members);
    const offsets = sides.flatMap((side) => {
        if (!drawsWhereItLies(side, node)) return [];
        const own = drawingOfSameSize(side, node)!;
        return frames.flatMap((frame) => [
            ...containerOffsetOn(side, frame, own),
            ...siblingOffsetsOn(draft, side, frame, own, members),
        ]);
    });
    const tried = new Set<string>();
    return offsets.find((offset) => {
        const key = `${offset.dx} ${offset.dy}`;
        if (offset.dx === 0 && offset.dy === 0) return false;
        if (tried.has(key)) return false;
        tried.add(key);
        return Placement.fitsAt(draft, group, offset, { into: frames });
    });
}

/** How far the result's container lies from where the side draws it, at its size, around the node. */
function containerOffsetOn(side: LayoutModel, frame: LayoutShape, own: LayoutShape): Offset[] {
    const drawn = drawingOfSameSize(side, frame);
    return drawn?.plane === own.plane ? [offsetBetween(drawn.bounds, frame.bounds)] : [];
}

/** How far the result's siblings inside the container lie from where the side draws them beside the node, nearest first. */
function siblingOffsetsOn(
    draft: DrawingDraft,
    side: LayoutModel,
    frame: LayoutShape,
    own: LayoutShape,
    members: ReadonlySet<string>,
): Offset[] {
    const ownCenter = centerOf(own.bounds);
    return draft
        .nodesOn(frame.plane)
        .filter(
            (sibling) =>
                !members.has(sibling.id) &&
                sibling.host === undefined &&
                frameIdsOf(sibling).includes(frame.id) &&
                liesWithin(sibling.bounds, frame.bounds),
        )
        .flatMap((sibling) => {
            const drawn = drawingOfSameSize(side, sibling);
            if (drawn?.plane !== own.plane) return [];
            const center = centerOf(drawn.bounds);
            const distance = Math.hypot(center.x - ownCenter.x, center.y - ownCenter.y);
            return [{ distance, offset: offsetBetween(drawn.bounds, sibling.bounds) }];
        })
        .sort((first, second) => first.distance - second.distance)
        .map(({ offset }) => offset);
}

/** The nearest free place inside every frame, off their borders, searched from the nearest place inside. */
function nearestPlaceInside(
    draft: DrawingDraft,
    group: ShapeGroup,
    frames: readonly LayoutShape[],
): Offset | undefined {
    const base = offsetInto(groupShapesBoundsIn(draft, group), frames.map(innerBoundsOf));
    if (base === undefined) return undefined;
    const window = Placement.searchWindowFrom(draft, group, base);
    return new Placement(draft, group, window, { into: frames }).nearestFitFrom(base);
}

/** The shortest offset that brings the bounds inside all frames; undefined when they leave no room for it. */
function offsetInto(bounds: DiagramBounds, frames: readonly DiagramBounds[]): Offset | undefined {
    const left = Math.max(...frames.map(({ x }) => x));
    const top = Math.max(...frames.map(({ y }) => y));
    const right = Math.min(...frames.map(rightOf));
    const bottom = Math.min(...frames.map(bottomOf));
    if (right - left < bounds.width || bottom - top < bounds.height) return undefined;
    const shiftInto = (start: number, end: number, from: number, to: number) =>
        start < from ? from - start : end > to ? to - end : 0;
    return {
        dx: shiftInto(bounds.x, rightOf(bounds), left, right),
        dy: shiftInto(bounds.y, bottomOf(bounds), top, bottom),
    };
}
