import type { BuildNote } from "./buildNotes";
import type { ContainerRepair } from "./layoutContainerMoves";
import type { FlowRepair, FlowRepairKind } from "./layoutFlowRepair";
import type { LaneStacking } from "./layoutLaneStacking";
import type { OverlapRepair } from "./layoutShapeMoves";
import { type LayoutSpot, isFlowSpot, sameSpot } from "./layoutSpots";

/** What the repair found and did, for the notes. */
export interface LayoutRepairOutcome {
    /** The appended lanes moved below their pool's lanes, which ends the overlaps they lay in. */
    readonly laneStackings: readonly LaneStacking[];
    /** The spots of the drawing as the build assembled it, with its appended lanes stacked. */
    readonly spots: readonly LayoutSpot[];
    /** The spots after the shapes moved, which the flow repair worked on; `spots` when none moved. */
    readonly spotsAfterMoves: readonly LayoutSpot[];
    readonly containerRepairs: readonly ContainerRepair[];
    /** The shapes moved or shifted to bring shapes into their containers, before any moved off another. */
    readonly shapesMovedForContainers: readonly string[];
    readonly overlapRepairs: readonly OverlapRepair[];
    readonly flowRepairs: readonly FlowRepair[];
}

/**
 * The broken spots the merge introduced into the drawing, read before the
 * repair, with what the repair did to each shape and flow; one flow's or
 * shape's spots of one kind share a note. A flow is named as the flow
 * repair found it after the shapes moved: a flow a move broke is named too,
 * one a move mended is not, and neither is any other spot a move mended but
 * an overlap, whose note says the build moved a shape off it, and a shape
 * the build brought into its container, whose note says so.
 */
export function layoutSpotNotes(outcome: LayoutRepairOutcome): BuildNote[] {
    const notes: BuildNote[] = outcome.laneStackings.map(({ lane, pool, overlapped }) => ({
        kind: "lanesOverlap",
        ids: [lane, ...overlapped],
        repair: "movedByBuild",
        moved: lane,
        pool,
    }));
    const shapesByNote = new Map<string, string[]>();
    const repairs = new SpotRepairs(outcome);
    for (const spot of spotsToName(outcome, repairs)) {
        const note = spotNoteOf(spot, repairs);
        if (!("shapes" in note)) {
            notes.push(note);
            continue;
        }
        const key = `${note.kind} ${note.id}`;
        const shapes = shapesByNote.get(key);
        if (shapes === undefined) {
            const collected = [...note.shapes];
            shapesByNote.set(key, collected);
            notes.push({ ...note, shapes: collected });
        } else {
            shapes.push(...note.shapes.filter((shape) => !shapes.includes(shape)));
        }
    }
    return notes;
}

/** What the repair did about each spot, by the repairs of shapes and flows. */
class SpotRepairs {
    private readonly movedForContainers: ReadonlySet<string>;

    constructor(private readonly outcome: LayoutRepairOutcome) {
        this.movedForContainers = new Set(outcome.shapesMovedForContainers);
    }

    flow(flow: string): FlowRepairKind {
        return (
            this.outcome.flowRepairs.find((repair) => repair.flow === flow)?.kind ?? "notRepaired"
        );
    }

    /** An overlap's repair; one a container repair resolved before the shape moves names the shape it moved. */
    overlap(shapes: readonly [string, string]): OverlapRepair {
        const repair = this.outcome.overlapRepairs.find((candidate) =>
            candidate.shapes.every((id, at) => shapes[at] === id),
        );
        if (repair !== undefined) return repair;
        const moved = shapes.find((id) => this.movedForContainers.has(id));
        return moved === undefined
            ? { kind: "notRepaired", shapes }
            : { kind: "movedByBuild", shapes, moved };
    }

    container(shape: string, container: string): ContainerRepair {
        return (
            this.outcome.containerRepairs.find(
                (repair) => repair.shape === shape && repair.container === container,
            ) ?? { kind: "notRepaired", shape, container }
        );
    }
}

/**
 * The assembled drawing's overlaps and the shapes the build brought into
 * their containers, its other spots only while still broken after the moves,
 * then the spots a move made, such as a flow it broke or a boundary event it
 * carried with its host out of the event's own lane.
 */
function spotsToName(
    { spots, spotsAfterMoves }: LayoutRepairOutcome,
    repairs: SpotRepairs,
): LayoutSpot[] {
    if (spotsAfterMoves === spots) return [...spots];
    const brokenFlows = new Set(spotsAfterMoves.filter(isFlowSpot).map(({ flow }) => flow));
    const stillThere = (spot: LayoutSpot) => spotsAfterMoves.some((after) => sameSpot(after, spot));
    const repaired = (spot: LayoutSpot) =>
        spot.kind === "shapesOverlap" ||
        (spot.kind === "shapeOutsideContainer" &&
            repairs.container(spot.shape, spot.container).kind !== "notRepaired");
    const stillNamed = (spot: LayoutSpot) =>
        isFlowSpot(spot) ? brokenFlows.has(spot.flow) : repaired(spot) || stillThere(spot);
    return [
        ...spots.filter(stillNamed),
        ...spotsAfterMoves.filter((spot) => !spots.some((known) => sameSpot(known, spot))),
    ];
}

function spotNoteOf(spot: LayoutSpot, repairs: SpotRepairs): BuildNote {
    switch (spot.kind) {
        case "flowEndOffShape":
            return {
                kind: spot.kind,
                id: spot.flow,
                shapes: [spot.end],
                repair: repairs.flow(spot.flow),
            };
        case "flowThroughShape":
            return {
                kind: spot.kind,
                id: spot.flow,
                shapes: [spot.shape],
                repair: repairs.flow(spot.flow),
            };
        case "shapeOutsideContainer":
            return containerNoteOf(spot.shape, repairs.container(spot.shape, spot.container));
        case "shapesOverlap":
            return overlapNoteOf(spot.shapes, repairs.overlap(spot.shapes));
        case "boundaryEventOffHost":
            return { kind: spot.kind, id: spot.boundaryEvent, host: spot.host };
        case "lanesOverlap":
            return { kind: spot.kind, ids: [...spot.lanes], repair: "notRepaired" };
    }
}

function containerNoteOf(id: string, repair: ContainerRepair): BuildNote {
    const note = { kind: "shapeOutsideContainer", id, shapes: [repair.container] } as const;
    return repair.kind === "grewContainerAndShifted"
        ? { ...note, repair: repair.kind, shifted: repair.shifted }
        : { ...note, repair: repair.kind };
}

function overlapNoteOf(shapes: readonly string[], repair: OverlapRepair): BuildNote {
    const ids = [...shapes];
    switch (repair.kind) {
        case "movedByBuild":
            return { kind: "shapesOverlap", ids, repair: repair.kind, moved: repair.moved };
        case "madeRoom":
            return {
                kind: "shapesOverlap",
                ids,
                repair: repair.kind,
                moved: repair.moved,
                shifted: repair.shifted,
            };
        case "notRepaired":
            return { kind: "shapesOverlap", ids, repair: "notRepaired" };
    }
}
