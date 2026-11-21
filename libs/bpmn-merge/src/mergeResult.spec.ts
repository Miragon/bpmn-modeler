import { describe, expect, it } from "vitest";

import { mergeElement } from "./__fixtures__/mergeResultBuilder";
import {
    type ConflictState,
    type ElementState,
    type MergeSide,
    type LayoutState,
    type ResolvedState,
    addedOnlyBy,
    combinedLayoutOf,
    isConflictState,
    isLane,
    layoutLeaderOf,
    preferredLayoutSideOf,
} from "./mergeResult";

const CONFLICTS: readonly ConflictState[] = [
    "bothChanged",
    "bothAdded",
    "removedAndChanged",
    "changedAndRemoved",
    "onlyInCurrent",
    "onlyInIncoming",
    "differs",
];

const RESOLVED: readonly ResolvedState[] = [
    "unchanged",
    "takenFromCurrent",
    "takenFromIncoming",
    "sameChange",
    "addedByCurrent",
    "addedByIncoming",
    "sameAddition",
    "removedByCurrent",
    "removedByIncoming",
    "removedByBoth",
];

describe("isConflictState", () => {
    it.each(CONFLICTS)("counts %s as a conflict", (state) => {
        expect(isConflictState(state)).toBe(true);
    });

    it.each(RESOLVED)("counts %s as resolved", (state) => {
        expect(isConflictState(state)).toBe(false);
    });
});

describe("addedOnlyBy", () => {
    it.each<[ElementState, MergeSide, boolean]>([
        ["onlyInIncoming", "incoming", true],
        ["onlyInIncoming", "current", false],
        ["addedByCurrent", "current", true],
        ["addedByCurrent", "incoming", false],
        ["bothAdded", "incoming", false],
        ["removedByCurrent", "incoming", false],
        ["changedAndRemoved", "current", false],
        ["unchanged", "current", false],
    ])("counts a %s element as added only by %s: %s", (state, side, added) => {
        expect(addedOnlyBy(mergeElement("Task", state), side)).toBe(added);
    });
});

describe("combinedLayoutOf", () => {
    it.each<{ layouts: LayoutState[]; combined: LayoutState }>([
        { layouts: [], combined: "unchanged" },
        { layouts: ["unchanged", "unchanged"], combined: "unchanged" },
        { layouts: ["unchanged", "takenFromIncoming"], combined: "takenFromIncoming" },
        { layouts: ["takenFromCurrent", "unchanged"], combined: "takenFromCurrent" },
        { layouts: ["takenFromCurrent", "takenFromIncoming"], combined: "bothChanged" },
        { layouts: ["bothChanged", "unchanged"], combined: "bothChanged" },
    ])("combines $layouts into $combined", ({ layouts, combined }) => {
        expect(combinedLayoutOf(layouts)).toBe(combined);
    });
});

describe("isLane", () => {
    it.each([
        ["bpmn:Lane", true],
        ["bpmn:LaneSet", false],
        ["bpmn:Participant", false],
        ["bpmn:Task", false],
    ])("counts a %s as a lane: %s", (type, lane) => {
        expect(isLane(mergeElement("Element_1", "unchanged", { type }))).toBe(lane);
    });
});

describe("preferredLayoutSideOf", () => {
    it.each<[LayoutState, MergeSide]>([
        ["unchanged", "current"],
        ["takenFromCurrent", "current"],
        ["bothChanged", "current"],
        ["takenFromIncoming", "incoming"],
    ])("prefers the layout of %s from %s", (layout, side) => {
        expect(preferredLayoutSideOf(layout)).toBe(side);
    });

    it.each<[LayoutState, MergeSide | undefined, MergeSide]>([
        ["bothChanged", "incoming", "incoming"],
        ["bothChanged", "current", "current"],
        ["bothChanged", undefined, "current"],
        ["takenFromCurrent", "incoming", "current"],
        ["takenFromIncoming", "current", "incoming"],
        ["unchanged", "incoming", "current"],
    ])("prefers the layout of %s with %s leading from %s", (layout, leader, side) => {
        expect(preferredLayoutSideOf(layout, leader)).toBe(side);
    });
});

describe("layoutLeaderOf", () => {
    const drawnByAll = (moves: readonly LayoutState[]) =>
        moves.map((moved, index) =>
            mergeElement(`Task_${index}`, "unchanged", { layout: moved, moved }),
        );

    it.each<{ case: string; layouts: LayoutState[]; leader: MergeSide | undefined }>([
        {
            case: "incoming moved more than half of them and more than current",
            layouts: [
                "takenFromIncoming",
                "takenFromIncoming",
                "bothChanged",
                "takenFromCurrent",
                "unchanged",
            ],
            leader: "incoming",
        },
        {
            case: "current moved more than half of them and more than incoming",
            layouts: [
                "takenFromCurrent",
                "takenFromCurrent",
                "bothChanged",
                "takenFromIncoming",
                "unchanged",
            ],
            leader: "current",
        },
        {
            case: "incoming moved only half of them",
            layouts: ["takenFromIncoming", "takenFromIncoming", "unchanged", "unchanged"],
            leader: undefined,
        },
        {
            case: "both moved as many",
            layouts: ["bothChanged", "bothChanged", "bothChanged"],
            leader: undefined,
        },
        { case: "nothing is drawn by all three", layouts: [], leader: undefined },
    ])("is $leader when $case", ({ layouts, leader }) => {
        expect(layoutLeaderOf(drawnByAll(layouts))).toBe(leader);
    });

    it("counts a drawing changed without moving its shapes, as by a colour, as no move", () => {
        const recoloured = ["A", "B", "C"].map((id) =>
            mergeElement(id, "unchanged", { layout: "takenFromIncoming", moved: "unchanged" }),
        );

        expect(layoutLeaderOf(recoloured)).toBeUndefined();
    });

    it("counts an element without shapes, such as a flow, neither as moved nor among the shapes", () => {
        const elements = [
            ...drawnByAll(["takenFromIncoming", "takenFromIncoming", "unchanged"]),
            ...["Flow_1", "Flow_2"].map((id) =>
                mergeElement(id, "unchanged", { layout: "takenFromCurrent" }),
            ),
        ];

        expect(layoutLeaderOf(elements)).toBe("incoming");
    });

    it("counts only the elements the base and both sides draw", () => {
        const elements = [
            ...drawnByAll(["takenFromIncoming", "unchanged"]),
            mergeElement("Task_New", "addedByIncoming", {
                layout: "takenFromIncoming",
                moved: "takenFromIncoming",
            }),
            mergeElement("Task_Undrawn", "unchanged", {
                layout: "takenFromIncoming",
                moved: "takenFromIncoming",
                base: { drawn: false },
            }),
        ];

        expect(layoutLeaderOf(elements)).toBeUndefined();
    });
});
