import type { BuildNote } from "./buildNotes";
import type { LayoutSpot } from "./layoutSpots";

/** The broken spots the merge introduced into the drawing; one flow's or shape's spots of one kind share a note. */
export function layoutSpotNotes(spots: readonly LayoutSpot[]): BuildNote[] {
    const notes: BuildNote[] = [];
    const shapesByNote = new Map<string, string[]>();
    for (const note of spots.map(spotNoteOf)) {
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

function spotNoteOf(spot: LayoutSpot): BuildNote {
    switch (spot.kind) {
        case "flowEndOffShape":
            return { kind: spot.kind, id: spot.flow, shapes: [spot.end] };
        case "flowThroughShape":
            return { kind: spot.kind, id: spot.flow, shapes: [spot.shape] };
        case "shapeOutsideContainer":
            return { kind: spot.kind, id: spot.shape, shapes: [spot.container] };
        case "shapesOverlap":
            return { kind: spot.kind, ids: [...spot.shapes] };
        case "boundaryEventOffHost":
            return { kind: spot.kind, id: spot.boundaryEvent, host: spot.host };
        case "lanesOverlap":
            return { kind: spot.kind, ids: [...spot.lanes] };
    }
}
