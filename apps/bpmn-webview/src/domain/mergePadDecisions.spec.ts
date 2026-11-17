import { describe, expect, it } from "vitest";

import type {
    MergePaneBadge,
    MergePaneRestoreOffer,
    MergePaneShapelessRow,
} from "@miragon/bpmn-modeler-shared";

import {
    decidesInMenu,
    keepsEverythingInside,
    mergePadDecisions,
    type MergePadStates,
    type MergeRowDecision,
    mergeRowDecisions,
    type MergeRowStates,
} from "./mergePadDecisions";

const states = (overrides: Partial<MergePadStates> = {}): MergePadStates => ({
    caption: { side: "incoming", role: "upstream" },
    pickable: [{ id: "Task_1" }],
    badges: [],
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
            { pickable: [{ id: "Task_1", container: "contents" }] },
            ["keep element", "keep withContents"],
        ],
        [
            "the user kept it from this side: no keep, and undo",
            {
                pickable: [{ id: "Task_1", undo: "element" }],
                badges: [keptHere("element")],
            },
            ["undo"],
        ],
        [
            "a container the user kept alone: keep everything inside, and undo",
            {
                pickable: [{ id: "Task_1", container: "contents", undo: "element" }],
                badges: [keptHere("element")],
            },
            ["keep withContents", "undo"],
        ],
        [
            "a container the user kept with everything inside: undo only",
            {
                pickable: [{ id: "Task_1", container: "contents", undo: "withContents" }],
                badges: [keptHere("withContents")],
            },
            ["undo"],
        ],
        [
            "the user kept it with its flows from this side: undo only",
            {
                pickable: [{ id: "Task_1", undo: "withConnections" }],
                badges: [keptHere("withConnections")],
            },
            ["undo"],
        ],
        [
            "the user kept the other side's version: keep this side's, and undo",
            {
                pickable: [{ id: "Task_1", undo: "element" }],
                badges: [{ ...keptHere("element"), kind: "replacedHere", keptSide: "current" }],
            },
            ["keep element", "undo"],
        ],
        [
            "the other side removed it: keep it, or leave it out",
            { pickable: [{ id: "Task_1", otherSideLacks: "removed" }] },
            ["keep element", "leaveOut"],
        ],
        [
            "the other side never had it: keep it, or leave it out",
            { pickable: [{ id: "Task_1", otherSideLacks: "missing" }] },
            ["keep element", "leaveOut"],
        ],
        [
            "the result already leaves it out: no leave-out",
            {
                pickable: [
                    {
                        id: "Task_1",
                        takenSide: "current",
                        otherSideLacks: "removed",
                    },
                ],
            },
            ["keep element"],
        ],
        [
            "the host offers its removed flows: keep them too",
            {
                pickable: [{ id: "Task_1", undo: "element" }],
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
                    {
                        id: "Task_1",
                        container: "contents",
                        undo: "element",
                        otherSideLacks: "removed",
                    },
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
                pickable: [{ id: "Task_1", container: "contents", otherSideLacks: "missing" }],
            }),
            "Task_1",
        );

        expect(decisions).toStrictEqual([
            { kind: "keep", scope: "element", side: paneSide },
            { kind: "keep", scope: "withContents", side: paneSide, reach: "contents" },
            { kind: "leaveOut", side: otherSide, otherSideLacks: "missing" },
        ]);
    });

    it.each(["contents", "poolProcesses"] as const)(
        "carries the container's reach, %s, on its keep with everything inside",
        (reach) => {
            const decisions = mergePadDecisions(
                states({ pickable: [{ id: "Task_1", container: reach }] }),
                "Task_1",
            );

            expect(decisions.find(keepsEverythingInside)?.reach).toBe(reach);
        },
    );

    it.each(["current", "incoming"] as const)(
        "keeps the removed flows from the side that kept the element, as the row does, on the %s pane",
        (paneSide) => {
            const decisions = mergePadDecisions(
                states({ caption: { side: paneSide, role: "unknown" }, restoreOffer: OFFER }),
                "Task_1",
            );

            expect(decisions.at(-1)).toStrictEqual({
                kind: "keepRemovedFlows",
                side: "incoming",
                offer: OFFER,
            });
        },
    );
});

describe("mergeRowDecisions", () => {
    const row = (overrides: Partial<MergePaneShapelessRow> = {}): MergePaneShapelessRow => ({
        id: "Message_1",
        type: "bpmn:Message",
        marker: "conflict",
        differences: [],
        ...overrides,
    });
    const named = (decision: MergeRowDecision) => {
        switch (decision.kind) {
            case "keep":
                return keepsEverythingInside(decision)
                    ? `keepInside ${decision.side}${decision.pressed ? " pressed" : ""}`
                    : `keep ${decision.side}`;
            case "leaveOut":
            case "keepRemovedFlows":
                return `${decision.kind} ${decision.side}`;
            case "undo":
                return `undo ${decision.scope}`;
        }
    };

    it.each<[string, Partial<MergePaneShapelessRow>, MergeRowStates, string[]]>([
        [
            "an open conflict both sides hold: keep either side",
            {},
            {},
            ["keep current", "keep incoming"],
        ],
        [
            "the user kept current's: keep incoming, and undo",
            { takenSide: "current", pick: { keptSide: "current", scope: "element" } },
            {},
            ["keep incoming", "undo element"],
        ],
        [
            "an open conflict on a container, such as the process: keep either side, alone or with everything inside",
            { type: "bpmn:Process", container: "contents" },
            {},
            ["keep current", "keepInside current", "keep incoming", "keepInside incoming"],
        ],
        [
            "a container the user kept alone from incoming: everything inside from incoming too, and undo",
            {
                container: "contents",
                takenSide: "incoming",
                pick: { keptSide: "incoming", scope: "element" },
            },
            {},
            ["keep current", "keepInside current", "keepInside incoming", "undo element"],
        ],
        [
            "a container the user kept from incoming with everything inside: current's, incoming's pressed, and undo as far",
            {
                container: "contents",
                takenSide: "incoming",
                pick: { keptSide: "incoming", scope: "withContents" },
            },
            {},
            [
                "keep current",
                "keepInside current",
                "keepInside incoming pressed",
                "undo withContents",
            ],
        ],
        [
            "a container only current has: everything inside only from current",
            {
                container: "contents",
                takenSide: "current",
                lackingSide: { side: "incoming", lack: "missing" },
            },
            {},
            ["keep current", "keepInside current", "leaveOut incoming"],
        ],
        [
            "only current has it, as incoming never had it: keep current, or leave it out",
            { takenSide: "current", lackingSide: { side: "incoming", lack: "missing" } },
            {},
            ["keep current", "leaveOut incoming"],
        ],
        [
            "current removed it and the result leaves it out: keep incoming only",
            { takenSide: "current", lackingSide: { side: "current", lack: "removed" } },
            {},
            ["keep incoming"],
        ],
        [
            "the user kept it against current's removal: leave it out, and undo",
            {
                takenSide: "incoming",
                lackingSide: { side: "current", lack: "removed" },
                pick: { keptSide: "incoming", scope: "element" },
            },
            {},
            ["leaveOut current", "undo element"],
        ],
        [
            "the host offers the flows current removed with it: keep them from incoming",
            {
                takenSide: "incoming",
                lackingSide: { side: "current", lack: "removed" },
                pick: { keptSide: "incoming", scope: "element" },
            },
            { restoreOffer: { elementId: "Message_1", connections: ["F"], removedBy: "current" } },
            ["leaveOut current", "keepRemovedFlows incoming", "undo element"],
        ],
        [
            "the host offers another element's flows: no offer here",
            {},
            { restoreOffer: { elementId: "Task_1", connections: ["F"], removedBy: "current" } },
            ["keep current", "keep incoming"],
        ],
    ])("%s", (_case, rowOverrides, rowStates, expected) => {
        expect(mergeRowDecisions(rowStates, row(rowOverrides)).map(named)).toStrictEqual(expected);
    });

    it("carries a collaboration's reach, every pool with its process, on both sides' keep with everything inside", () => {
        const decisions = mergeRowDecisions(
            {},
            row({ type: "bpmn:Collaboration", container: "poolProcesses" }),
        );

        expect(decisions.filter(keepsEverythingInside)).toStrictEqual([
            { kind: "keep", scope: "withContents", side: "current", reach: "poolProcesses" },
            { kind: "keep", scope: "withContents", side: "incoming", reach: "poolProcesses" },
        ]);
    });

    it("lets only a keep with everything inside be pressed", () => {
        const pressedKeepInside: MergeRowDecision = {
            kind: "keep",
            scope: "withContents",
            side: "current",
            reach: "contents",
            pressed: true,
        };
        const pressedKeep: MergeRowDecision = {
            kind: "keep",
            scope: "element",
            side: "current",
            // @ts-expect-error a keep of the element alone is never pressed
            pressed: true,
        };
        // @ts-expect-error an undo is never pressed
        const pressedUndo: MergeRowDecision = { kind: "undo", scope: "element", pressed: true };

        expect(
            [pressedKeepInside, pressedKeep, pressedUndo].map(keepsEverythingInside),
        ).toStrictEqual([true, false, false]);
    });

    it("words a leave-out with why the side lacks the element, as the pad does", () => {
        expect(
            mergeRowDecisions({}, row({ lackingSide: { side: "current", lack: "removed" } })),
        ).toStrictEqual([
            { kind: "leaveOut", side: "current", otherSideLacks: "removed" },
            { kind: "keep", scope: "element", side: "incoming" },
        ]);
    });
});

describe("decidesInMenu", () => {
    it.each([
        [true, true],
        [false, false],
    ])("a step without a shape %s → decided in the menu %s", (shapeless, expected) => {
        expect(decidesInMenu({ shapeless })).toBe(expected);
    });
});
