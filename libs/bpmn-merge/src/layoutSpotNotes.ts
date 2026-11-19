import type { BuildNote } from "./buildNotes";
import type { FlowRepair, FlowRepairKind } from "./layoutFlowRepair";
import type { OverlapRepair } from "./layoutShapeMoves";
import { type LayoutSpot, isFlowSpot, sameSpot } from "./layoutSpots";

/** What the repair found and did, for the notes. */
export interface LayoutRepairOutcome {
    /** The spots of the drawing as the build assembled it. */
    readonly spots: readonly LayoutSpot[];
    /** The spots after the shapes moved, which the flow repair worked on; `spots` when none moved. */
    readonly spotsAfterMoves: readonly LayoutSpot[];
    readonly overlapRepairs: readonly OverlapRepair[];
    readonly flowRepairs: readonly FlowRepair[];
}

/**
 * The broken spots the merge introduced into the drawing, read before the
 * repair, with what the repair did to each shape and flow; one flow's or
 * shape's spots of one kind share a note. A flow is named as the flow
 * repair found it after the shapes moved: a flow a move broke is named too,
 * one a move mended is not, and neither is any other spot a move mended but
 * an overlap, whose note says the build moved a shape off it.
 */
export function layoutSpotNotes(outcome: LayoutRepairOutcome): BuildNote[] {
    const { flowRepairs, overlapRepairs } = outcome;
    const repairOf = (flow: string): FlowRepairKind =>
        flowRepairs.find((repair) => repair.flow === flow)?.kind ?? "notRepaired";
    const overlapRepairOf = (shapes: readonly string[]): OverlapRepair | undefined =>
        overlapRepairs.find((repair) => repair.shapes.every((id, at) => shapes[at] === id));
    const notes: BuildNote[] = [];
    const shapesByNote = new Map<string, string[]>();
    for (const spot of spotsToName(outcome)) {
        const note = spotNoteOf(spot, repairOf, overlapRepairOf);
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

/** The assembled drawing's overlaps, its other spots only while still broken after the moves, then the flows a move broke. */
function spotsToName({ spots, spotsAfterMoves }: LayoutRepairOutcome): LayoutSpot[] {
    if (spotsAfterMoves === spots) return [...spots];
    const brokenFlows = new Set(spotsAfterMoves.filter(isFlowSpot).map(({ flow }) => flow));
    const stillThere = (spot: LayoutSpot) => spotsAfterMoves.some((after) => sameSpot(after, spot));
    const stillNamed = (spot: LayoutSpot) =>
        isFlowSpot(spot)
            ? brokenFlows.has(spot.flow)
            : spot.kind === "shapesOverlap" || stillThere(spot);
    return [
        ...spots.filter(stillNamed),
        ...spotsAfterMoves.filter(
            (spot) => isFlowSpot(spot) && !spots.some((known) => sameSpot(known, spot)),
        ),
    ];
}

function spotNoteOf(
    spot: LayoutSpot,
    repairOf: (flow: string) => FlowRepairKind,
    overlapRepairOf: (shapes: readonly string[]) => OverlapRepair | undefined,
): BuildNote {
    switch (spot.kind) {
        case "flowEndOffShape":
            return {
                kind: spot.kind,
                id: spot.flow,
                shapes: [spot.end],
                repair: repairOf(spot.flow),
            };
        case "flowThroughShape":
            return {
                kind: spot.kind,
                id: spot.flow,
                shapes: [spot.shape],
                repair: repairOf(spot.flow),
            };
        case "shapeOutsideContainer":
            return { kind: spot.kind, id: spot.shape, shapes: [spot.container] };
        case "shapesOverlap":
            return overlapNoteOf(spot.shapes, overlapRepairOf(spot.shapes));
        case "boundaryEventOffHost":
            return { kind: spot.kind, id: spot.boundaryEvent, host: spot.host };
        case "lanesOverlap":
            return { kind: spot.kind, ids: [...spot.lanes] };
    }
}

function overlapNoteOf(shapes: readonly string[], repair: OverlapRepair | undefined): BuildNote {
    const ids = [...shapes];
    switch (repair?.kind) {
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
        case undefined:
            return { kind: "shapesOverlap", ids, repair: "notRepaired" };
    }
}
