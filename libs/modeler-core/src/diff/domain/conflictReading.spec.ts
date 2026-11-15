import { describe, expect, it } from "vitest";

import { ConflictStageFacts } from "./conflictFacts";
import { ConflictReading, conflictReadingOf, isMergeViewCandidate } from "./conflictReading";

const facts = (overrides: Partial<ConflictStageFacts>): ConflictStageFacts => ({
    gitAvailable: true,
    inMergeChanges: true,
    stages: { base: "<base/>", current: "<current/>", incoming: "<incoming/>" },
    refs: {},
    ...overrides,
});

describe("conflictReadingOf", () => {
    it.each<[string, string, ConflictStageFacts, ConflictReading]>([
        [
            "both sides modified (UU)",
            "order.bpmn",
            facts({}),
            { kind: "resolvable", hasBase: true },
        ],
        [
            "both sides added the file (AA)",
            "order.bpmn",
            facts({ stages: { current: "<a/>", incoming: "<b/>" } }),
            { kind: "resolvable", hasBase: false },
        ],
        [
            "incoming deleted the file (UD)",
            "order.bpmn",
            facts({ stages: { base: "<base/>", current: "<a/>" } }),
            { kind: "oneSideDeleted", remainingSide: "current" },
        ],
        [
            "current deleted the file (DU)",
            "order.bpmn",
            facts({ stages: { base: "<base/>", incoming: "<b/>" } }),
            { kind: "oneSideDeleted", remainingSide: "incoming" },
        ],
        [
            "a file Merge Changes does not list",
            "order.bpmn",
            facts({ inMergeChanges: false, stages: {} }),
            { kind: "notConflicted" },
        ],
        [
            "Git is unavailable",
            "order.bpmn",
            facts({ gitAvailable: false, inMergeChanges: false, stages: {} }),
            { kind: "gitUnavailable" },
        ],
        [
            "a listed file whose stages Git does not hand over",
            "order.bpmn",
            facts({ stages: {} }),
            { kind: "gitUnavailable" },
        ],
        ["a conflicted text file", "notes.txt", facts({}), { kind: "notBpmn" }],
        [
            "a text file while Git is unavailable",
            "notes.txt",
            facts({ gitAvailable: false }),
            { kind: "notBpmn" },
        ],
        ["an upper-case extension", "ORDER.BPMN", facts({}), { kind: "resolvable", hasBase: true }],
    ])("%s", (_case, fileName, given, expected) => {
        expect(conflictReadingOf(fileName, given)).toStrictEqual(expected);
    });
});

describe("isMergeViewCandidate", () => {
    it.each([
        ["order.bpmn", true],
        ["Order.BPMN", true],
        ["shipping.dmn", false],
        ["notes.txt", false],
        ["order.bpmn.orig", false],
    ])("%s → %s", (fileName, expected) => {
        expect(isMergeViewCandidate(fileName)).toBe(expected);
    });
});
