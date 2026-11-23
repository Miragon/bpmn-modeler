import { describe, expect, it } from "vitest";

import type {
    MergePanePick,
    MergePaneRestoreOffer,
    MergePaneShapelessRow,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import {
    decidesInMenu,
    keepsEverythingInside,
    type MergePadDecision,
    mergePadDecisions,
    type MergePadStates,
    type MergeRowDecision,
    mergeRowDecisions,
    type MergeRowStates,
} from "./mergePadDecisions";
import type { MergePadOffers } from "./mergeElementPick";

const states = (overrides: Partial<MergePadStates> = {}): MergePadStates => ({
    caption: { side: "incoming", role: "upstream" },
    pickable: [{ id: "Task_1" }],
    ...overrides,
});

const picked = (scope: MergePickScope, keptSide: MergeSide = "incoming"): MergePanePick => ({
    keptSide,
    scope,
});

const OFFER: MergePaneRestoreOffer = {
    elementId: "Task_1",
    connections: ["Flow_1", "Flow_2"],
    removedBy: "current",
};

const OFFERS_XML_MERGE = { elementXmlMerge: true } as const;

const NO_XML_MERGE = { elementXmlMerge: false } as const;

const named = (decision: MergePadDecision) => {
    switch (decision.kind) {
        case "keep":
            return `keep ${decision.scope}`;
        case "mergeXml":
            return `mergeXml ${decision.mode}`;
        default:
            return decision.kind;
    }
};

const kinds = (paneStates: MergePadStates, offers: MergePadOffers = OFFERS_XML_MERGE) =>
    mergePadDecisions(paneStates, "Task_1", offers).map(named);

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
                pickable: [{ id: "Task_1", pick: picked("element") }],
            },
            ["undo"],
        ],
        [
            "a container the user kept alone: keep everything inside, and undo",
            {
                pickable: [{ id: "Task_1", container: "contents", pick: picked("element") }],
            },
            ["keep withContents", "undo"],
        ],
        [
            "a container the user kept with everything inside: undo only",
            {
                pickable: [{ id: "Task_1", container: "contents", pick: picked("withContents") }],
            },
            ["undo"],
        ],
        [
            "the user kept it with what was removed with it from this side: undo only",
            {
                pickable: [{ id: "Task_1", pick: picked("withRemoved") }],
            },
            ["undo"],
        ],
        [
            "the user kept the other side's version: keep this side's, and undo",
            {
                pickable: [{ id: "Task_1", pick: picked("element", "current") }],
            },
            ["keep element", "undo"],
        ],
        [
            "the other side removed it: keep it, or leave it out",
            { pickable: [{ id: "Task_1", lackingSide: { side: "current", lack: "removed" } }] },
            ["keep element", "leaveOut"],
        ],
        [
            "the other side never had it: keep it, or leave it out",
            { pickable: [{ id: "Task_1", lackingSide: { side: "current", lack: "missing" } }] },
            ["keep element", "leaveOut"],
        ],
        [
            "the pane's own side lacks it: picking that side leaves it out, never keeps it",
            { pickable: [{ id: "Task_1", lackingSide: { side: "incoming", lack: "missing" } }] },
            ["leaveOut"],
        ],
        [
            "the result already leaves it out: no leave-out",
            {
                pickable: [
                    {
                        id: "Task_1",
                        takenSide: "current",
                        lackingSide: { side: "current", lack: "removed" },
                    },
                ],
            },
            ["keep element"],
        ],
        [
            "the host offers what was removed with it: keep that too",
            {
                pickable: [{ id: "Task_1", pick: picked("element") }],
                restoreOffer: OFFER,
            },
            ["keepRemovedWith", "undo"],
        ],
        [
            "the host offers another element's flows: no offer here",
            { restoreOffer: { ...OFFER, elementId: "Task_2" } },
            ["keep element"],
        ],
        [
            "a container the other side removed, kept with what was removed with it offered: every entry in order",
            {
                pickable: [
                    {
                        id: "Task_1",
                        container: "contents",
                        lackingSide: { side: "current", lack: "removed" },
                        pick: picked("element", "current"),
                    },
                ],
                restoreOffer: OFFER,
            },
            ["keep element", "keep withContents", "leaveOut", "keepRemovedWith", "undo"],
        ],
    ])("%s", (_case, overrides, expected) => {
        expect(kinds(states(overrides))).toStrictEqual(expected);
    });

    it("offers nothing on an element the host does not let the user pick", () => {
        expect(mergePadDecisions(states(), "Task_2", NO_XML_MERGE)).toStrictEqual([]);
    });

    it.each([
        ["current", "incoming"],
        ["incoming", "current"],
    ] as const)("keeps from the %s pane's side and leaves out with %s", (paneSide, otherSide) => {
        const decisions = mergePadDecisions(
            states({
                caption: { side: paneSide, role: "unknown" },
                pickable: [
                    {
                        id: "Task_1",
                        container: "contents",
                        lackingSide: { side: otherSide, lack: "missing" },
                    },
                ],
            }),
            "Task_1",
            NO_XML_MERGE,
        );

        expect(decisions).toStrictEqual([
            { kind: "keep", scope: "element", side: paneSide },
            { kind: "keep", scope: "withContents", side: paneSide, reach: "contents" },
            { kind: "leaveOut", side: otherSide, lack: "missing" },
        ]);
    });

    it.each(["contents", "poolProcesses"] as const)(
        "carries the container's reach, %s, on its keep with everything inside",
        (reach) => {
            const decisions = mergePadDecisions(
                states({ pickable: [{ id: "Task_1", container: reach }] }),
                "Task_1",
                NO_XML_MERGE,
            );

            expect(decisions.find(keepsEverythingInside)?.reach).toBe(reach);
        },
    );

    it.each(["current", "incoming"] as const)(
        "keeps what was removed with it from the side that kept the element, as the row does, on the %s pane",
        (paneSide) => {
            const decisions = mergePadDecisions(
                states({ caption: { side: paneSide, role: "unknown" }, restoreOffer: OFFER }),
                "Task_1",
                NO_XML_MERGE,
            );

            expect(decisions.at(-1)).toStrictEqual({
                kind: "keepRemovedWith",
                side: "incoming",
                offer: OFFER,
            });
        },
    );

    it.each<[string, Partial<MergePadStates>, string[]]>([
        [
            "a picked element whose three texts differ: merge its XML, before undo",
            {
                pickable: [{ id: "Task_1", handMerge: "pickedVersion", pick: picked("element") }],
            },
            ["mergeXml open", "undo"],
        ],
        [
            "an element merged by hand: edit the merged XML",
            {
                pickable: [
                    {
                        id: "Task_1",
                        handMerge: "pickedVersion",
                        pick: { ...picked("element"), mergedByHand: true },
                    },
                ],
            },
            ["mergeXml edit", "undo"],
        ],
        [
            "the pane of the side the pick replaced: keep this side's, merge the XML, undo",
            {
                pickable: [
                    {
                        id: "Task_1",
                        handMerge: "pickedVersion",
                        pick: picked("element", "current"),
                    },
                ],
            },
            ["keep element", "mergeXml open", "undo"],
        ],
        [
            "the restore offer comes before the XML merge",
            {
                pickable: [{ id: "Task_1", handMerge: "pickedVersion", pick: picked("element") }],
                restoreOffer: OFFER,
            },
            ["keepRemovedWith", "mergeXml open", "undo"],
        ],
    ])("%s", (_case, overrides, expected) => {
        expect(kinds(states(overrides))).toStrictEqual(expected);
    });

    it("offers no XML merge where the host has no merge editor", () => {
        const handMergeable = states({
            pickable: [{ id: "Task_1", handMerge: "pickedVersion", pick: picked("element") }],
        });

        expect(kinds(handMergeable, { elementXmlMerge: false })).toStrictEqual(["undo"]);
    });

    describe("an element no pick decides whose three texts differ", () => {
        it.each(["current", "incoming"] as const)(
            "offers Merge XML that keeps it from the %s pane's side first, after the keep",
            (paneSide) => {
                const openConflict = states({
                    caption: { side: paneSide, role: "unknown" },
                    pickable: [{ id: "Task_1", handMerge: "withPick" }],
                });

                expect(mergePadDecisions(openConflict, "Task_1", OFFERS_XML_MERGE)).toStrictEqual([
                    { kind: "keep", scope: "element", side: paneSide },
                    { kind: "mergeXml", mode: "keepAndOpen", side: paneSide },
                ]);
            },
        );

        it("offers it on an element the merge decided by itself or another pick pulled in", () => {
            const takenFromCurrent = states({
                pickable: [{ id: "Task_1", takenSide: "current", handMerge: "withPick" }],
            });

            expect(kinds(takenFromCurrent)).toStrictEqual(["keep element", "mergeXml keepAndOpen"]);
        });

        it("offers a container its keeps first, then Merge XML with the pick of the element alone", () => {
            const container = states({
                pickable: [{ id: "Task_1", container: "contents", handMerge: "withPick" }],
            });

            expect(kinds(container)).toStrictEqual([
                "keep element",
                "keep withContents",
                "mergeXml keepAndOpen",
            ]);
        });

        it("offers only the keep where the host has no merge editor", () => {
            const openConflict = states({ pickable: [{ id: "Task_1", handMerge: "withPick" }] });

            expect(kinds(openConflict, NO_XML_MERGE)).toStrictEqual(["keep element"]);
        });
    });

    it("offers a container the other side's pick keeps with everything inside this side's, alone and with everything inside", () => {
        const keptElsewhereWithContents = states({
            pickable: [
                { id: "Task_1", container: "contents", pick: picked("withContents", "current") },
            ],
        });

        expect(kinds(keptElsewhereWithContents)).toStrictEqual([
            "keep element",
            "keep withContents",
            "undo",
        ]);
    });

    it("takes back the scope the user's pick holds", () => {
        const keptWithContents = states({
            pickable: [{ id: "Task_1", container: "contents", pick: picked("withContents") }],
        });

        expect(mergePadDecisions(keptWithContents, "Task_1", NO_XML_MERGE)).toStrictEqual([
            { kind: "undo", scope: "withContents" },
        ]);
    });
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
            case "keepRemovedWith":
                return `${decision.kind} ${decision.side}`;
            case "undo":
                return `undo ${decision.scope}`;
            case "mergeXml":
                return `mergeXml ${decision.mode}`;
        }
    };

    const ON_INCOMING: MergeRowStates = { caption: { side: "incoming", role: "upstream" } };
    const ON_CURRENT: MergeRowStates = { caption: { side: "current", role: "branch" } };

    it.each<[string, Partial<MergePaneShapelessRow>, MergeRowStates, string[]]>([
        [
            "an open conflict both sides hold: keep either side",
            {},
            ON_INCOMING,
            ["keep current", "keep incoming"],
        ],
        [
            "the user kept current's: keep incoming, and undo",
            { takenSide: "current", pick: { keptSide: "current", scope: "element" } },
            ON_INCOMING,
            ["keep incoming", "undo element"],
        ],
        [
            "an open conflict on a container, such as the process: keep either side, alone or with everything inside",
            { type: "bpmn:Process", container: "contents" },
            ON_INCOMING,
            ["keep current", "keepInside current", "keep incoming", "keepInside incoming"],
        ],
        [
            "a container the user kept alone from incoming: everything inside from incoming too, and undo",
            {
                container: "contents",
                takenSide: "incoming",
                pick: { keptSide: "incoming", scope: "element" },
            },
            ON_INCOMING,
            ["keep current", "keepInside current", "keepInside incoming", "undo element"],
        ],
        [
            "a container the user kept from incoming with everything inside: current's, incoming's pressed, and undo as far",
            {
                container: "contents",
                takenSide: "incoming",
                pick: { keptSide: "incoming", scope: "withContents" },
            },
            ON_INCOMING,
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
            ON_INCOMING,
            ["keep current", "keepInside current", "leaveOut incoming"],
        ],
        [
            "only current has it, as incoming never had it: keep current, or leave it out",
            { takenSide: "current", lackingSide: { side: "incoming", lack: "missing" } },
            ON_INCOMING,
            ["keep current", "leaveOut incoming"],
        ],
        [
            "current removed it and the result leaves it out: keep incoming only",
            { takenSide: "current", lackingSide: { side: "current", lack: "removed" } },
            ON_INCOMING,
            ["keep incoming"],
        ],
        [
            "the user kept it against current's removal: leave it out, and undo",
            {
                takenSide: "incoming",
                lackingSide: { side: "current", lack: "removed" },
                pick: { keptSide: "incoming", scope: "element" },
            },
            ON_INCOMING,
            ["leaveOut current", "undo element"],
        ],
        [
            "the host offers the flows current removed with it: keep them from incoming",
            {
                takenSide: "incoming",
                lackingSide: { side: "current", lack: "removed" },
                pick: { keptSide: "incoming", scope: "element" },
            },
            {
                ...ON_INCOMING,
                restoreOffer: { elementId: "Message_1", connections: ["F"], removedBy: "current" },
            },
            ["leaveOut current", "keepRemovedWith incoming", "undo element"],
        ],
        [
            "the host offers another element's flows: no offer here",
            {},
            {
                ...ON_INCOMING,
                restoreOffer: { elementId: "Task_1", connections: ["F"], removedBy: "current" },
            },
            ["keep current", "keep incoming"],
        ],
    ])("%s", (_case, rowOverrides, rowStates, expected) => {
        expect(
            mergeRowDecisions(rowStates, row(rowOverrides), NO_XML_MERGE).map(named),
        ).toStrictEqual(expected);
    });

    it.each<[string, Partial<MergePaneShapelessRow>, string[]]>([
        [
            "a picked row whose three texts differ: merge its XML, before undo",
            {
                takenSide: "current",
                pick: { keptSide: "current", scope: "element" },
                handMerge: "pickedVersion",
            },
            ["keep incoming", "mergeXml open", "undo element"],
        ],
        [
            "a row merged by hand: edit the merged XML",
            {
                takenSide: "current",
                pick: { keptSide: "current", scope: "element", mergedByHand: true },
                handMerge: "pickedVersion",
            },
            ["keep incoming", "mergeXml edit", "undo element"],
        ],
    ])("%s", (_case, rowOverrides, expected) => {
        expect(
            mergeRowDecisions(ON_INCOMING, row(rowOverrides), { elementXmlMerge: true }).map(named),
        ).toStrictEqual(expected);
    });

    it.each<[string, MergeRowStates, MergeSide]>([
        ["current", ON_CURRENT, "current"],
        ["incoming", ON_INCOMING, "incoming"],
    ])(
        "offers an open row whose three texts differ Merge XML that keeps it from the %s pane's side, after both keeps",
        (_pane, rowStates, paneSide) => {
            expect(
                mergeRowDecisions(rowStates, row({ handMerge: "withPick" }), OFFERS_XML_MERGE),
            ).toStrictEqual([
                { kind: "keep", scope: "element", side: "current" },
                { kind: "keep", scope: "element", side: "incoming" },
                { kind: "mergeXml", mode: "keepAndOpen", side: paneSide },
            ]);
        },
    );

    it("offers a row no XML merge where the host has no merge editor", () => {
        const picked = row({
            takenSide: "current",
            pick: { keptSide: "current", scope: "element" },
            handMerge: "pickedVersion",
        });

        expect(mergeRowDecisions(ON_INCOMING, picked, NO_XML_MERGE).map(named)).toStrictEqual([
            "keep incoming",
            "undo element",
        ]);
    });

    it("carries a collaboration's reach, every pool with its process, on both sides' keep with everything inside", () => {
        const decisions = mergeRowDecisions(
            ON_INCOMING,
            row({ type: "bpmn:Collaboration", container: "poolProcesses" }),
            NO_XML_MERGE,
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

    it("presses the held keep with everything inside where the other side lacks the container", () => {
        const keptAgainstRemoval = row({
            container: "contents",
            takenSide: "incoming",
            lackingSide: { side: "current", lack: "removed" },
            pick: { keptSide: "incoming", scope: "withContents" },
        });

        expect(
            mergeRowDecisions(ON_INCOMING, keptAgainstRemoval, NO_XML_MERGE).map(named),
        ).toStrictEqual(["leaveOut current", "keepInside incoming pressed", "undo withContents"]);
    });

    it("words a leave-out with why the side lacks the element, as the pad does", () => {
        expect(
            mergeRowDecisions(
                ON_INCOMING,
                row({ lackingSide: { side: "current", lack: "removed" } }),
                NO_XML_MERGE,
            ),
        ).toStrictEqual([
            { kind: "leaveOut", side: "current", lack: "removed" },
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
