import { describe, expect, it } from "vitest";

import type { MergePaneBadge } from "@miragon/bpmn-modeler-shared";
import { MERGE_MARKER_CLASSES, type MergeMarker } from "@miragon/bpmn-modeler-types";

import { MERGE_DECISION_ICONS, PEN_PATHS } from "./mergeDecisionIcons";
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
        side: keptSide[0].toUpperCase() + keptSide.slice(1),
        label: `${keptSide} ${scope}`,
    }),
});

const PICKED: MergePaneBadge = {
    id: "Task_Pack",
    kind: "keptHere",
    keptSide: "incoming",
    scope: "element",
};

interface RecordedOverlay {
    element: string;
    type: string;
    html: string;
    position: { top?: number; left?: number };
    show?: { minZoom?: number; maxZoom?: number };
    scale?: unknown;
}

// A long straight flow, and one too short to hold a check off its arrowhead.
const WAYPOINTS: Record<string, { x: number; y: number }[]> = {
    Flow_1: [
        { x: 100, y: 200 },
        { x: 300, y: 200 },
    ],
    Flow_Short: [
        { x: 100, y: 200 },
        { x: 120, y: 200 },
    ],
};

// diagram-js's Overlays._updateOverlayVisibilty: hidden below `minZoom` and above `maxZoom`.
function shownAt(overlay: RecordedOverlay, scale: number): boolean {
    const { minZoom, maxZoom } = overlay.show ?? {};
    return (
        !(minZoom !== undefined && minZoom > scale) && !(maxZoom !== undefined && maxZoom < scale)
    );
}

function neighbourDoubles(value: number): [below: number, above: number] {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value);
    const bits = view.getBigUint64(0);
    view.setBigUint64(0, bits - 1n);
    const below = view.getFloat64(0);
    view.setBigUint64(0, bits + 1n);
    return [below, view.getFloat64(0)];
}

/** A canvas holding `ids`, recording markers and overlays as diagram-js keeps them. */
function fakeCanvas(ids: readonly string[]) {
    const markers = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
    const elements = ids.map((id) =>
        id in WAYPOINTS ? { id, waypoints: WAYPOINTS[id] } : { id, width: 100, height: 80 },
    );
    const overlays: RecordedOverlay[] = [];
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
        add: (
            element: string,
            type: string,
            overlay: Omit<RecordedOverlay, "element" | "type">,
        ) => {
            if (!markers.has(element)) throw new Error("invalid element specified");
            overlays.push({ element, type, ...overlay });
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
        expect([...new Set(badges.map(({ element }) => element))]).toEqual(["Task_Pack", "Flow_1"]);
        expect(badges.every(({ html }) => html.includes("merge-pick-badge__check"))).toBe(true);
        expect(badges[0].html).toContain('aria-label="incoming element"');
        expect(badges[0].html).toContain("merge-pick-badge--kept-here");
        const flowBadge = badges.find(({ element }) => element === "Flow_1");
        expect(flowBadge?.html).toContain("merge-pick-badge--replaced-here");
        expect(flowBadge?.html).toContain("merge-pick-badge--with-contents");
        expect(markersOf("Task_Check")).toContain("merge-consequence");
        expect(markersOf("Task_Pack")).not.toContain("merge-consequence");

        marks().paint(view({ ...NO_MARKS, conflict: ["Task_Pack"] }), labels("Conflict"));

        expect(overlays.filter(({ type }) => type === "merge-pick")).toEqual([]);
        expect(markersOf("Task_Check")).not.toContain("merge-consequence");
    });

    it("names the kept side in words above a shape's top edge, and shrinks to the check at small zoom", () => {
        const { marks, overlays } = fakeCanvas(["Task_Pack"]);

        marks().paint(view(NO_MARKS, { badges: [PICKED], consequences: [] }), labels("Conflict"));

        const [worded, checkOnly] = overlays;
        expect(overlays).toHaveLength(2);
        expect(worded.html).toContain(">Incoming<");
        expect(worded.position.top).toBeLessThan(0);
        expect(worded.position.left).toBe(0);
        expect(checkOnly.html).not.toContain("Incoming");
        expect(checkOnly.html).toContain('aria-label="incoming element"');
        expect(checkOnly.position).toStrictEqual(worded.position);
        for (const overlay of overlays) {
            expect(overlay.html).toContain("merge-pick-badge--on-shape");
        }
        const smallZoom = worded.show?.minZoom ?? 0;
        expect(smallZoom).toBeGreaterThan(0);
        expect(shownAt(worded, 1)).toBe(true);
        expect(shownAt(checkOnly, 1)).toBe(false);
        expect(shownAt(worded, smallZoom / 2)).toBe(false);
        expect(shownAt(checkOnly, smallZoom / 2)).toBe(true);
    });

    it("shows exactly one badge on a picked shape at every zoom, also next to the threshold", () => {
        const { marks, overlays } = fakeCanvas(["Task_Pack"]);
        marks().paint(view(NO_MARKS, { badges: [PICKED], consequences: [] }), labels("Conflict"));
        const threshold = overlays[0].show?.minZoom ?? 0;
        const [justBelow, justAbove] = neighbourDoubles(threshold);

        for (const scale of [0.2, threshold - 0.005, justBelow, threshold, justAbove, 4]) {
            expect(
                overlays.filter((overlay) => shownAt(overlay, scale)),
                `at ${scale}`,
            ).toHaveLength(1);
        }
    });

    it("puts a flow's check alone in the middle of its longest segment, scaling with the zoom", () => {
        const { marks, overlays } = fakeCanvas(["Flow_1"]);

        marks().paint(
            view(NO_MARKS, { badges: [{ ...PICKED, id: "Flow_1" }], consequences: [] }),
            labels("Conflict"),
        );

        expect(overlays).toHaveLength(1);
        expect(overlays[0].position).toStrictEqual({ left: 100, top: 0 });
        expect(overlays[0].html).not.toContain("Incoming");
        expect(overlays[0].html).toContain("merge-pick-badge--on-flow");
        expect(overlays[0].show).toBeUndefined();
        expect(overlays[0].scale).toStrictEqual({ max: 1.5 });
    });

    it("leaves the check out on a flow too short to hold it off its arrowhead", () => {
        const { marks, overlays } = fakeCanvas(["Flow_Short"]);

        marks().paint(
            view(NO_MARKS, { badges: [{ ...PICKED, id: "Flow_Short" }], consequences: [] }),
            labels("Conflict"),
        );

        expect(overlays).toEqual([]);
    });

    it("marks a version merged by hand with a pen and its word, beside the kept side, at every zoom and on a flow", () => {
        const { marks, overlays } = fakeCanvas(["Task_Pack", "Flow_1"]);
        const byHand = (badge: MergePaneBadge) => ({
            side: "Incoming",
            label: `${badge.keptSide} merged by hand`,
            byHand: "by hand",
        });

        marks().paint(
            view(NO_MARKS, {
                badges: [
                    { ...PICKED, mergedByHand: true },
                    { ...PICKED, id: "Flow_1", kind: "replacedHere", mergedByHand: true },
                ],
                consequences: [],
            }),
            { conflict: "Conflict", badge: byHand },
        );

        const [worded, checkOnly, onFlow] = overlays;
        expect(worded.html).toContain("merge-pick-badge--by-hand");
        expect(worded.html).toContain("merge-pick-badge__pen");
        expect(worded.html).toContain(">Incoming<");
        expect(worded.html).toContain(">by hand<");
        expect(worded.html).toContain('aria-label="incoming merged by hand"');
        expect(checkOnly.html).toContain("merge-pick-badge__pen");
        expect(checkOnly.html).not.toContain("by hand<");
        // A flow's round badge holds one glyph: the pen stands for the pick too.
        expect(onFlow.html).toContain("merge-pick-badge__pen");
        expect(onFlow.html).not.toContain("merge-pick-badge__check");
        expect(onFlow.html).toContain("merge-pick-badge--by-hand");
    });

    it("draws the pen of the pad's Merge XML entry, so the badge looks like the entry that made it", () => {
        const { marks, overlays } = fakeCanvas(["Task_Pack"]);

        marks().paint(
            view(NO_MARKS, { badges: [{ ...PICKED, mergedByHand: true }], consequences: [] }),
            {
                conflict: "Conflict",
                badge: () => ({ side: "Incoming", label: "merged by hand", byHand: "by hand" }),
            },
        );

        expect(overlays[0].html).toContain(PEN_PATHS);
        expect(MERGE_DECISION_ICONS.mergeXml).toContain(PEN_PATHS);
    });

    it("takes the look of a merge by hand from its words alone, which the labels give only for one", () => {
        const { marks, overlays } = fakeCanvas(["Task_Pack"]);

        marks().paint(
            view(NO_MARKS, { badges: [{ ...PICKED, mergedByHand: true }], consequences: [] }),
            labels("Conflict"),
        );

        expect(overlays.some(({ html }) => html.includes("merge-pick-badge__pen"))).toBe(false);
        expect(overlays.some(({ html }) => html.includes("--by-hand"))).toBe(false);
    });

    it("draws no pen on a plain pick", () => {
        const { marks, overlays } = fakeCanvas(["Task_Pack"]);

        marks().paint(view(NO_MARKS, { badges: [PICKED], consequences: [] }), labels("Conflict"));

        expect(overlays.some(({ html }) => html.includes("merge-pick-badge__pen"))).toBe(false);
        expect(overlays.some(({ html }) => html.includes("--by-hand"))).toBe(false);
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
