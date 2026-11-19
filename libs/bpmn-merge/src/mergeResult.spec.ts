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
});
