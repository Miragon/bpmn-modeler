import type { BuildNote } from "./buildNotes";
import type { FlowRepair, FlowRepairKind } from "./layoutFlowRepair";
import type { OverlapRepair } from "./layoutShapeMoves";
import { type LayoutSpot, isFlowSpot } from "./layoutSpots";

/** What the repair found and did, for the notes. */
export interface LayoutRepairOutcome {
    /** The spots of the drawing as the build assembled it. */
    readonly spots: readonly LayoutSpot[];
    /** The spots the flow repair worked on, after the shapes moved; `spots` when none moved. */
    readonly flowSpotsAfterMoves: readonly LayoutSpot[];
    readonly overlapRepairs: readonly OverlapRepair[];
    readonly flowRepairs: readonly FlowRepair[];
}

/**
 * The broken spots the merge introduced into the drawing, read before the
 * repair, with what the repair did to each shape and flow; one flow's or
 * shape's spots of one kind share a note. A flow is named as the flow
 * repair found it after the shapes moved: a flow a move broke is named too,
 * one a move mended is not.
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

/** The assembled drawing's spots, its flows only while still broken after the moves, then the flows a move broke. */
function spotsToName({ spots, flowSpotsAfterMoves }: LayoutRepairOutcome): LayoutSpot[] {
    if (flowSpotsAfterMoves === spots) return [...spots];
    const brokenFlows = new Set(flowSpotsAfterMoves.filter(isFlowSpot).map(({ flow }) => flow));
    const known = new Set(spots.map((spot) => JSON.stringify(spot)));
    return [
        ...spots.filter((spot) => !isFlowSpot(spot) || brokenFlows.has(spot.flow)),
        ...flowSpotsAfterMoves.filter(
            (spot) => isFlowSpot(spot) && !known.has(JSON.stringify(spot)),
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
        default:
            return { kind: "shapesOverlap", ids, repair: "notRepaired" };
    }
}
