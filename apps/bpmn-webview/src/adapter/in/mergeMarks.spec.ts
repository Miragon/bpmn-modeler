import { describe, expect, it } from "vitest";

import { MERGE_MARKER_CLASSES } from "@miragon/bpmn-modeler-types";

import { createMergeMarksModule, MergeMarks } from "./mergeMarks";

const NO_MARKS = { takenFromThisSide: [], takenFromOtherSide: [], conflict: [] };

/** A canvas holding `ids`, recording markers and overlays as diagram-js keeps them. */
function fakeCanvas(ids: readonly string[]) {
    const markers = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
    const elements = ids.map((id) => ({ id }));
    const overlays: { element: string; type: string; html: string }[] = [];
    const canvas = {
        addMarker: (id: string, marker: string) => markers.get(id)?.add(marker),
        removeMarker: (id: string, marker: string) => markers.get(id)?.delete(marker),
        getContainer: () => document.createElement("div"),
    };
    const registry = {
        get: (id: string) => elements.find((element) => element.id === id),
        forEach: (visit: (element: { id: string }) => void) => elements.forEach(visit),
    };
    const overlayService = {
        add: (element: string, type: string, overlay: { html: string }) => {
            if (!markers.has(element)) throw new Error("invalid element specified");
            overlays.push({ element, type, html: overlay.html });
            return String(overlays.length);
        },
        remove: ({ type }: { type: string }) => {
            for (let index = overlays.length - 1; index >= 0; index -= 1) {
                if (overlays[index].type === type) overlays.splice(index, 1);
            }
        },
    };
    let attached: MergeMarks | undefined;
    new MergeMarks(canvas, registry, overlayService, { attach: (marks) => (attached = marks) });
    const markersOf = (id: string) => [...(markers.get(id) ?? [])];
    return { marks: () => attached as MergeMarks, markersOf, overlays };
}

describe("MergeMarks", () => {
    it("paints each marker's class on the elements this canvas holds", () => {
        const { marks, markersOf } = fakeCanvas(["Task_Check", "Task_Pack", "Flow_1"]);

        marks().paint(
            {
                takenFromThisSide: ["Task_Check"],
                takenFromOtherSide: ["Flow_1"],
                conflict: ["Task_Pack"],
            },
            "Conflict",
        );

        expect(markersOf("Task_Check")).toEqual([MERGE_MARKER_CLASSES.takenFromThisSide]);
        expect(markersOf("Flow_1")).toEqual([MERGE_MARKER_CLASSES.takenFromOtherSide]);
        expect(markersOf("Task_Pack")).toEqual([MERGE_MARKER_CLASSES.conflict]);
    });

    it("gives every conflict a badge besides its colour, named for screen readers", () => {
        const { marks, overlays } = fakeCanvas(["Task_Pack"]);

        marks().paint({ ...NO_MARKS, conflict: ["Task_Pack"] }, "Konflikt");

        expect(overlays).toHaveLength(1);
        expect(overlays[0].element).toBe("Task_Pack");
        expect(overlays[0].html).toContain(">!<");
        expect(overlays[0].html).toContain('aria-label="Konflikt"');
    });

    it("removes the old marks and badges on a repaint", () => {
        const { marks, markersOf, overlays } = fakeCanvas(["Task_Check", "Task_Pack"]);
        marks().paint({ ...NO_MARKS, conflict: ["Task_Pack"] }, "Conflict");

        marks().paint({ ...NO_MARKS, takenFromThisSide: ["Task_Pack"] }, "Conflict");

        expect(markersOf("Task_Pack")).toEqual([MERGE_MARKER_CLASSES.takenFromThisSide]);
        expect(overlays).toEqual([]);
    });

    it("skips an id missing on this canvas", () => {
        const { marks, overlays } = fakeCanvas(["Task_Check"]);

        expect(() =>
            marks().paint({ ...NO_MARKS, conflict: ["Task_OnlyIncoming"] }, "Conflict"),
        ).not.toThrow();
        expect(overlays).toEqual([]);
    });

    it("hands itself to the pane that adds the module", () => {
        const module = createMergeMarksModule({ attach: () => undefined });

        expect(module.__init__).toEqual(["mergeMarks"]);
        expect(module.mergeMarks).toEqual(["type", MergeMarks]);
    });
});
