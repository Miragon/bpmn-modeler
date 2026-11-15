import { describe, expect, it } from "vitest";

import { type ConflictState, type ResolvedState, isConflictState, otherSide } from "./mergeResult";

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

describe("otherSide", () => {
    it.each([
        ["current", "incoming"],
        ["incoming", "current"],
    ] as const)("merges %s with %s", (side, other) => {
        expect(otherSide(side)).toBe(other);
    });
});
