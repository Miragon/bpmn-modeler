import { describe, expect, it } from "vitest";

import type { MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";

import type { MergeRememberedOutcome } from "./mergeOutcomeCard";
import { mergeMenuRows, type MergeMenuRowStates, openShapelessConflicts } from "./mergeMenuRows";

const translate = (key: string, replacements: Record<string, string> = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? name);

const ROWS: readonly MergePaneShapelessRow[] = [
    { id: "Message_1", type: "bpmn:Message", marker: "conflict", container: false },
    {
        id: "Error_1",
        type: "bpmn:Error",
        marker: "takenFromThisSide",
        container: false,
        takenSide: "incoming",
        pick: { keptSide: "incoming", scope: "element" },
    },
];

const STATES: MergeMenuRowStates = {
    shapelessRows: ROWS,
    names: { Message_1: "Order received" },
};

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

const context = { nameOf: (id: string) => STATES.names[id] ?? id, translate };

describe("mergeMenuRows", () => {
    it("lists each row with the host's name and the decisions the pad's rule offers", () => {
        expect(mergeMenuRows(STATES, undefined, context)).toStrictEqual([
            {
                id: "Message_1",
                type: "bpmn:Message",
                marker: "conflict",
                name: "Order received",
                decisions: [
                    { kind: "keep", scope: "element", side: "current" },
                    { kind: "keep", scope: "element", side: "incoming" },
                ],
            },
            {
                id: "Error_1",
                type: "bpmn:Error",
                marker: "takenFromThisSide",
                decisions: [
                    { kind: "keep", scope: "element", side: "current" },
                    { kind: "undo", scope: "element" },
                ],
            },
        ]);
    });

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
                { id: "Process_1", type: "bpmn:Process", marker: "conflict", container: true },
                {
                    id: "Message_1",
                    type: "bpmn:Message",
                    marker: "takenFromThisSide",
                    container: false,
                },
                { id: "Error_1", type: "bpmn:Error", marker: "conflict", container: false },
            ]),
        ).toBe(2);
        expect(openShapelessConflicts([])).toBe(0);
    });
});
