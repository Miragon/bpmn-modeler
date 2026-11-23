import { isNonEmpty } from "@miragon/bpmn-modeler-types/domain";

import type { BuildNoteContent, NoteRepairOf } from "../buildNotes";
import type { LaneStacking } from "./layoutLaneStacking";
import { type SpotRepair, SpotRepairs } from "./layoutSpotRepairs";
import { type LayoutSpot, repairedTogether, sameSpot } from "./layoutSpots";

/** What the repair found and did, for the notes. */
export interface LayoutRepairOutcome {
    /** The appended lanes moved below their pool's lanes, which ends the overlaps they lay in and brings them into their pool. */
    readonly laneStackings: readonly LaneStacking[];
    /** The spots of the drawing as the build assembled it, with its appended lanes stacked. */
    readonly spots: readonly LayoutSpot[];
    /** The spots after the shapes moved, which the flow repair worked on; `spots` when none moved. */
    readonly spotsAfterMoves: readonly LayoutSpot[];
    /** What each step did about the spots it acted on, in the order the steps ran. */
    readonly repairs: readonly SpotRepair[];
}

/**
 * The broken spots the merge introduced into the drawing, read before the
 * repair, with what the repair did to each shape and flow; one flow's or
 * shape's spots of one kind share a note. A flow is named as the flow
 * repair found it after the shapes moved: a flow a move broke is named too,
 * one a move mended is not, and neither is any other spot a move mended
 * unless a step mended it on purpose, which its note says.
 */
export function layoutSpotNotes(outcome: LayoutRepairOutcome): BuildNoteContent[] {
    const notes: BuildNoteContent[] = outcome.laneStackings.map(laneStackedNote);
    const shapesByNote = new Map<string, string[]>();
    const repairs = new SpotRepairs(outcome.repairs);
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

/** A lane moved below its pool's lanes, with the frames that grew to hold it and the shapes it shifted down, if any. */
function laneStackedNote({ lane, grown, overlapped, shifted }: LaneStacking): BuildNoteContent {
    const ids = [lane, ...overlapped];
    return isNonEmpty(shifted)
        ? {
              kind: "lanesOverlap",
              ids,
              repair: "movedByBuildAndShifted",
              moved: lane,
              grown,
              shifted,
          }
        : { kind: "lanesOverlap", ids, repair: "movedByBuild", moved: lane, grown };
}

/**
 * The assembled drawing's spots a step mended or still broken after the
 * moves, then the spots a move made, such as a flow it broke or a boundary
 * event it carried with its host out of the event's own lane.
 */
function spotsToName(
    { spots, spotsAfterMoves }: LayoutRepairOutcome,
    repairs: SpotRepairs,
): LayoutSpot[] {
    if (spotsAfterMoves === spots) return [...spots];
    const stillBroken = (spot: LayoutSpot) =>
        spotsAfterMoves.some((after) => repairedTogether(after, spot));
    const stillNamed = (spot: LayoutSpot) => repairs.repaired(spot) || stillBroken(spot);
    return [
        ...spots.filter(stillNamed),
        ...spotsAfterMoves.filter((spot) => !spots.some((known) => sameSpot(known, spot))),
    ];
}

function spotNoteOf(spot: LayoutSpot, repairs: SpotRepairs): BuildNoteContent {
    switch (spot.kind) {
        case "flowEndOffShape":
            return {
                kind: spot.kind,
                id: spot.flow,
                shapes: [spot.end],
                repair: repairs.of(spot).kind,
            };
        case "flowThroughShape":
            return {
                kind: spot.kind,
                id: spot.flow,
                shapes: [spot.shape],
                repair: repairs.of(spot).kind,
            };
        case "shapeOutsideContainer":
            return {
                kind: spot.kind,
                id: spot.shape,
                shapes: [spot.container],
                ...noteRepairOf(repairs.of(spot)),
            };
        case "shapesOverlap":
            return {
                kind: spot.kind,
                ids: [...spot.shapes],
                ...noteRepairOf(repairs.of(spot)),
            };
        case "boundaryEventOffHost":
            return { kind: spot.kind, id: spot.boundaryEvent, host: spot.host };
        case "lanesOverlap":
            return { kind: spot.kind, ids: [...spot.lanes], repair: "notRepaired" };
    }
}

function noteRepairOf<Repair extends { readonly kind: string }>({
    kind,
    ...rest
}: Repair): NoteRepairOf<Repair> {
    return { ...rest, repair: kind } as NoteRepairOf<Repair>;
}
