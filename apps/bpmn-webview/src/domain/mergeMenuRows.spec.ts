import { describe, expect, it } from "vitest";

import type { MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";

import type { MergeRememberedOutcome } from "./mergeOutcomeCard";
import { mergeMenuRows, type MergeMenuRowStates, openShapelessConflicts } from "./mergeMenuRows";

const translate = (key: string, replacements: Record<string, string> = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? name);

const MESSAGE_VALUES = {
    differences: [{ attribute: "name", current: "Order received", incoming: "Order placed" }],
} as const;

const ROWS: readonly MergePaneShapelessRow[] = [
    {
        id: "Message_1",
        type: "bpmn:Message",
        marker: "conflict",
        current: { name: "Order received" },
        incoming: { name: "Order placed" },
        ...MESSAGE_VALUES,
    },
    {
        id: "Error_1",
        type: "bpmn:Error",
        marker: "takenFromThisSide",
        takenSide: "incoming",
        pick: { keptSide: "incoming", scope: "element" },
        lackingSide: { side: "current", lack: "missing" },
        incoming: {},
        differences: [],
    },
];

const STATES: MergeMenuRowStates = { shapelessRows: ROWS };

const NAMES: Readonly<Record<string, string>> = { Message_1: "Order received" };

const keptError: MergeRememberedOutcome = {
    outcome: {
        applied: true,
        action: "pick",
        elementId: "Error_1",
        pulledIn: [],
        dropped: [],
        reopened: [],
    },
    acted: {
        kind: "keep",
        elementId: "Error_1",
        scope: "element",
        side: "incoming",
        origin: "menu",
    },
};

const context = {
    nameOf: (id: string) => NAMES[id] ?? id,
    translate,
    elementXmlChanges: false,
};

describe("mergeMenuRows", () => {
    it("lists each row with its sides' values and the decisions the pad's rule offers", () => {
        expect(mergeMenuRows(STATES, undefined, context)).toStrictEqual([
            {
                id: "Message_1",
                type: "bpmn:Message",
                marker: "conflict",
                name: "Order received",
                values: MESSAGE_VALUES,
                decisions: [
                    { kind: "keep", scope: "element", side: "current" },
                    { kind: "keep", scope: "element", side: "incoming" },
                ],
                xmlChanges: false,
            },
            {
                id: "Error_1",
                type: "bpmn:Error",
                marker: "takenFromThisSide",
                values: { lackingSide: { side: "current", lack: "missing" }, differences: [] },
                decisions: [
                    { kind: "leaveOut", side: "current", otherSideLacks: "missing" },
                    { kind: "undo", scope: "element" },
                ],
                xmlChanges: false,
            },
        ]);
    });

    it.each<[string, Partial<MergePaneShapelessRow>, string | undefined]>([
        ["current's name", {}, "Order received"],
        ["incoming's name where current has none", { current: {} }, "Order placed"],
        ["incoming's name where current lacks the element", { current: undefined }, "Order placed"],
        ["no name where no side names it", { current: {}, incoming: {} }, undefined],
    ])("titles a row with %s", (_case, overrides, expected) => {
        const row = { ...ROWS[0], ...overrides };
        const [content] = mergeMenuRows({ shapelessRows: [row] }, undefined, context);

        expect(content?.name).toBe(expected);
    });

    it("keeps a row's title and values after a pick of either side", () => {
        const before = mergeMenuRows(STATES, undefined, context)[0];
        for (const keptSide of ["current", "incoming"] as const) {
            const picked = {
                ...ROWS[0],
                marker: "takenFromThisSide" as const,
                takenSide: keptSide,
                pick: { keptSide, scope: "element" as const },
            };
            const [after] = mergeMenuRows({ shapelessRows: [picked] }, undefined, context);

            expect({ name: after?.name, values: after?.values }).toStrictEqual({
                name: before?.name,
                values: before?.values,
            });
        }
    });

    it.each([
        [true, true],
        [false, false],
    ])(
        "offers the XML changes of every row, one side's element included, where the host shows them: %s",
        (elementXmlChanges, expected) => {
            const offered = mergeMenuRows(STATES, undefined, { ...context, elementXmlChanges });

            expect(offered.map(({ id, xmlChanges }) => [id, xmlChanges])).toStrictEqual([
                ["Message_1", expected],
                ["Error_1", expected],
            ]);
        },
    );

    it("says in its row what the row's last decision did, as the card would", () => {
        const rows = mergeMenuRows(STATES, keptError, context);

        expect(rows.find(({ id }) => id === "Error_1")?.outcome).toStrictEqual([
            "Kept from incoming: Error_1",
        ]);
        expect(rows.find(({ id }) => id === "Message_1")?.outcome).toBeUndefined();
    });
});

describe("openShapelessConflicts", () => {
    it("counts the rows that are open conflicts", () => {
        expect(
            openShapelessConflicts([
                { ...ROWS[0], id: "Process_1", type: "bpmn:Process", container: "contents" },
                { ...ROWS[0], marker: "takenFromThisSide" },
                { ...ROWS[1], marker: "conflict" },
            ]),
        ).toBe(2);
        expect(openShapelessConflicts([])).toBe(0);
    });
});
