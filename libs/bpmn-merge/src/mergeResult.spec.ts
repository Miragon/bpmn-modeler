import { describe, expect, it } from "vitest";

import { mergeElement } from "./__fixtures__/mergeResultBuilder";
import {
    type ConflictState,
    type ElementState,
    type MergeSide,
    type ResolvedState,
    addedOnlyBy,
    isConflictState,
    otherSide,
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

describe("otherSide", () => {
    it.each([
        ["current", "incoming"],
        ["incoming", "current"],
    ] as const)("merges %s with %s", (side, other) => {
        expect(otherSide(side)).toBe(other);
    });
});
