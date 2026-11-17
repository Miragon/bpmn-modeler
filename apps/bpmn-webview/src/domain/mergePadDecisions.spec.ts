import { describe, expect, it } from "vitest";

import type { MergePaneBadge, MergePaneRestoreOffer } from "@miragon/bpmn-modeler-shared";

import { decidesInLegend, mergePadDecisions, type MergePadStates } from "./mergePadDecisions";

const NO_MARKS = { takenFromThisSide: [], takenFromOtherSide: [], conflict: [] };

const states = (overrides: Partial<MergePadStates> = {}): MergePadStates => ({
    caption: { side: "incoming", role: "upstream" },
    pickable: [{ id: "Task_1", container: false }],
    badges: [],
    marks: NO_MARKS,
    ...overrides,
});

const keptHere = (scope: MergePaneBadge["scope"]): MergePaneBadge => ({
    id: "Task_1",
    kind: "keptHere",
    keptSide: "incoming",
    scope,
});

const OFFER: MergePaneRestoreOffer = {
    elementId: "Task_1",
    connections: ["Flow_1", "Flow_2"],
    removedBy: "current",
};

const kinds = (paneStates: MergePadStates) =>
    mergePadDecisions(paneStates, "Task_1").map((decision) =>
        decision.kind === "keep" ? `keep ${decision.scope}` : decision.kind,
    );

describe("mergePadDecisions", () => {
    it.each<[string, Partial<MergePadStates>, string[]]>([
        ["an undecided element: keep it from the pane's side", {}, ["keep element"]],
        [
            "a container: keep it, or keep it with everything inside",
            { pickable: [{ id: "Task_1", container: true }] },
            ["keep element", "keep withContents"],
        ],
        [
            "the user kept it from this side: no keep, and undo",
            {
                pickable: [{ id: "Task_1", container: false, undo: "element" }],
                badges: [keptHere("element")],
            },
            ["undo"],
        ],
        [
            "a container the user kept alone: keep everything inside, and undo",
            {
                pickable: [{ id: "Task_1", container: true, undo: "element" }],
                badges: [keptHere("element")],
            },
            ["keep withContents", "undo"],
        ],
        [
            "a container the user kept with everything inside: undo only",
            {
                pickable: [{ id: "Task_1", container: true, undo: "withContents" }],
                badges: [keptHere("withContents")],
            },
            ["undo"],
        ],
        [
            "the user kept it with its flows from this side: undo only",
            {
                pickable: [{ id: "Task_1", container: false, undo: "withConnections" }],
                badges: [keptHere("withConnections")],
            },
            ["undo"],
        ],
        [
            "the user kept the other side's version: keep this side's, and undo",
            {
                pickable: [{ id: "Task_1", container: false, undo: "element" }],
                badges: [{ ...keptHere("element"), kind: "replacedHere", keptSide: "current" }],
            },
            ["keep element", "undo"],
        ],
        [
            "the other side removed it: keep it, or leave it out",
            { pickable: [{ id: "Task_1", container: false, otherSideLacks: "removed" }] },
            ["keep element", "leaveOut"],
        ],
        [
            "the other side never had it: keep it, or leave it out",
            { pickable: [{ id: "Task_1", container: false, otherSideLacks: "missing" }] },
            ["keep element", "leaveOut"],
        ],
        [
            "the result already leaves it out: no leave-out",
            {
                pickable: [{ id: "Task_1", container: false, otherSideLacks: "removed" }],
                marks: { ...NO_MARKS, takenFromOtherSide: ["Task_1"] },
            },
            ["keep element"],
        ],
        [
            "the host offers its removed flows: keep them too",
            {
                pickable: [{ id: "Task_1", container: false, undo: "element" }],
                badges: [keptHere("element")],
                restoreOffer: OFFER,
            },
            ["keepRemovedFlows", "undo"],
        ],
        [
            "the host offers another element's flows: no offer here",
            { restoreOffer: { ...OFFER, elementId: "Task_2" } },
            ["keep element"],
        ],
        [
            "a container the other side removed, kept with its flows offered: every entry in order",
            {
                pickable: [
                    { id: "Task_1", container: true, undo: "element", otherSideLacks: "removed" },
                ],
                badges: [{ ...keptHere("element"), kind: "replacedHere", keptSide: "current" }],
                restoreOffer: OFFER,
            },
            ["keep element", "keep withContents", "leaveOut", "keepRemovedFlows", "undo"],
        ],
    ])("%s", (_case, overrides, expected) => {
        expect(kinds(states(overrides))).toStrictEqual(expected);
    });

    it("offers nothing on an element the host does not let the user pick", () => {
        expect(mergePadDecisions(states(), "Task_2")).toStrictEqual([]);
    });

    it.each([
        ["current", "incoming"],
        ["incoming", "current"],
    ] as const)("keeps from the %s pane's side and leaves out with %s", (paneSide, otherSide) => {
        const decisions = mergePadDecisions(
            states({
                caption: { side: paneSide, role: "unknown" },
                pickable: [{ id: "Task_1", container: true, otherSideLacks: "missing" }],
                restoreOffer: OFFER,
            }),
            "Task_1",
        );

        expect(decisions).toStrictEqual([
            { kind: "keep", scope: "element", side: paneSide },
            { kind: "keep", scope: "withContents", side: paneSide },
            { kind: "leaveOut", side: otherSide, otherSideLacks: "missing" },
            { kind: "keepRemovedFlows", side: paneSide, offer: OFFER },
        ]);
    });
});

describe("decidesInLegend", () => {
    it.each([
        [true, true],
        [false, false],
    ])("a step without a shape %s → decided in the legend %s", (shapeless, expected) => {
        expect(decidesInLegend({ shapeless })).toBe(expected);
    });
});
