import { describe, expect, it } from "vitest";

import type { MergePaneBadge } from "@miragon/bpmn-modeler-shared";
import { MERGE_MARKER_CLASSES, type MergeMarker } from "@miragon/bpmn-modeler-types";

import {
    createMergeMarksModule,
    MergeMarks,
    type MergeMarksLabels,
    type MergeMarksView,
} from "./mergeMarks";

const NO_MARKS = { takenFromThisSide: [], takenFromOtherSide: [], conflict: [] };

const view = (
    marks: Readonly<Record<MergeMarker, readonly string[]>>,
    picks: Pick<MergeMarksView, "badges" | "consequences"> = { badges: [], consequences: [] },
): MergeMarksView => ({ marks, ...picks });

const labels = (conflict: string): MergeMarksLabels => ({
    conflict,
    badge: ({ keptSide, scope }) => ({
        letter: keptSide[0].toUpperCase(),
        label: `${keptSide} ${scope}`,
    }),
});

const PICKED: MergePaneBadge = {
    id: "Task_Pack",
    kind: "keptHere",
    keptSide: "incoming",
    scope: "element",
};

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
            view({
                takenFromThisSide: ["Task_Check"],
                takenFromOtherSide: ["Flow_1"],
                conflict: ["Task_Pack"],
            }),
            labels("Conflict"),
        );

        expect(markersOf("Task_Check")).toEqual([MERGE_MARKER_CLASSES.takenFromThisSide]);
        expect(markersOf("Flow_1")).toEqual([MERGE_MARKER_CLASSES.takenFromOtherSide]);
        expect(markersOf("Task_Pack")).toEqual([MERGE_MARKER_CLASSES.conflict]);
    });

    it("gives every conflict a badge besides its colour, named for screen readers", () => {
        const { marks, overlays } = fakeCanvas(["Task_Pack"]);

        marks().paint(view({ ...NO_MARKS, conflict: ["Task_Pack"] }), labels("Konflikt"));

        expect(overlays).toHaveLength(1);
        expect(overlays[0].element).toBe("Task_Pack");
        expect(overlays[0].html).toContain(">!<");
        expect(overlays[0].html).toContain('aria-label="Konflikt"');
    });

    it("removes the old marks and badges on a repaint", () => {
        const { marks, markersOf, overlays } = fakeCanvas(["Task_Check", "Task_Pack"]);
        marks().paint(view({ ...NO_MARKS, conflict: ["Task_Pack"] }), labels("Conflict"));

        marks().paint(view({ ...NO_MARKS, takenFromThisSide: ["Task_Pack"] }), labels("Conflict"));

        expect(markersOf("Task_Pack")).toEqual([MERGE_MARKER_CLASSES.takenFromThisSide]);
        expect(overlays).toEqual([]);
    });

    it("skips an id missing on this canvas", () => {
        const { marks, overlays } = fakeCanvas(["Task_Check"]);

        expect(() =>
            marks().paint(
                view({ ...NO_MARKS, conflict: ["Task_OnlyIncoming"] }),
                labels("Conflict"),
            ),
        ).not.toThrow();
        expect(overlays).toEqual([]);
    });

    it("draws a badge on every picked element this canvas holds, none on consequences, and removes it after undo", () => {
        const { marks, markersOf, overlays } = fakeCanvas(["Task_Pack", "Task_Check", "Flow_1"]);

        marks().paint(
            view(
                { ...NO_MARKS, takenFromThisSide: ["Task_Pack", "Task_Check"] },
                {
                    badges: [
                        PICKED,
                        { ...PICKED, id: "Flow_1", kind: "replacedHere", scope: "withContents" },
                    ],
                    consequences: ["Task_Check"],
                },
            ),
            labels("Conflict"),
        );

        const badges = overlays.filter(({ type }) => type === "merge-pick");
        expect(badges.map(({ element }) => element)).toEqual(["Task_Pack", "Flow_1"]);
        expect(badges[0].html).toContain('aria-label="incoming element"');
        expect(badges[0].html).toContain(">I<");
        expect(badges[0].html).toContain("merge-pick-badge--kept-here");
        expect(badges[1].html).toContain("merge-pick-badge--replaced-here");
        expect(badges[1].html).toContain("merge-pick-badge--with-contents");
        expect(markersOf("Task_Check")).toContain("merge-consequence");
        expect(markersOf("Task_Pack")).not.toContain("merge-consequence");

        marks().paint(view({ ...NO_MARKS, conflict: ["Task_Pack"] }), labels("Conflict"));

        expect(overlays.filter(({ type }) => type === "merge-pick")).toEqual([]);
        expect(markersOf("Task_Check")).not.toContain("merge-consequence");
    });

    it("skips a picked id missing on this canvas", () => {
        const { marks, overlays } = fakeCanvas(["Task_Check"]);

        expect(() =>
            marks().paint(
                view(NO_MARKS, { badges: [PICKED], consequences: ["Task_Pack"] }),
                labels("Conflict"),
            ),
        ).not.toThrow();
        expect(overlays).toEqual([]);
    });

    it("hands itself to the pane that adds the module", () => {
        const module = createMergeMarksModule({ attach: () => undefined });

        expect(module.__init__).toEqual(["mergeMarks"]);
        expect(module.mergeMarks).toEqual(["type", MergeMarks]);
    });
});
