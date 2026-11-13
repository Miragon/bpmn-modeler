import { describe, expect, it } from "vitest";

import type { ElementIdRow } from "@miragon/bpmn-modeler-types";

import {
    elementIdReviewView,
    hiddenEditorReviewView,
    unsupportedReviewView,
} from "./elementIdReviewView";

const row = (overrides: Partial<ElementIdRow> & Pick<ElementIdRow, "id">): ElementIdRow => ({
    name: "Check stock",
    type: "bpmn:ServiceTask",
    kind: "activity",
    status: "rename",
    newId: "serviceTask_checkStock",
    clash: false,
    shownId: overrides.id,
    ...overrides,
});

const ROWS: ElementIdRow[] = [
    row({ id: "Activity_1" }),
    row({
        id: "Process_1",
        name: "Order fulfilment",
        type: "bpmn:Process",
        kind: "process",
        status: "unchecked",
        newId: "orderFulfilment",
        shownId: "Participant_1",
    }),
    row({
        id: "Event_1",
        name: "Order received",
        type: "bpmn:StartEvent",
        kind: "event",
        newId: "startEvent_orderReceived",
    }),
    row({
        id: "flow_inStock",
        name: "in stock",
        type: "bpmn:SequenceFlow",
        kind: "flow",
        status: "matches",
        newId: "flow_inStock",
    }),
    row({ id: "Flow_2", name: "", type: "bpmn:SequenceFlow", kind: "flow", status: "skipped" }),
];

describe("elementIdReviewView", () => {
    it("groups the changing rows by kind, then what already matches and what is skipped", () => {
        const view = elementIdReviewView("order.bpmn", ROWS, new Set(["Process_1"]));

        expect(view.groups.map(({ id, label, collapsed }) => [id, label, collapsed])).toEqual([
            ["process", "Processes", false],
            ["activity", "Activities", false],
            ["event", "Events", false],
            ["matches", "Already match", true],
            ["skipped", "No name, skipped", true],
        ]);
    });

    it("shows each changing row as its name, the old and the new ID, checked unless unchecked", () => {
        const view = elementIdReviewView("order.bpmn", ROWS, new Set(["Process_1"]));

        expect(view.groups[0]).toEqual({
            id: "process",
            label: "Processes",
            checked: false,
            collapsed: false,
            rows: [
                {
                    id: "Process_1",
                    label: "Order fulfilment",
                    description: "Process_1 → orderFulfilment",
                    tooltip: "Order fulfilment: Process_1 becomes orderFulfilment",
                    checked: false,
                    revealId: "Participant_1",
                },
            ],
        });
        expect(view.groups[1]?.checked).toBe(true);
        expect(view.groups[1]?.rows[0]?.checked).toBe(true);
    });

    it("follows the unchecked IDs it is given, before the editor lists the rows again", () => {
        const view = elementIdReviewView("order.bpmn", ROWS, new Set(["Activity_1"]));

        expect(view.groups.map((group) => group.checked)).toEqual([
            true,
            false,
            true,
            undefined,
            undefined,
        ]);
        expect(view.renameCount).toBe(2);
    });

    it("gives rows that keep their ID no checkbox, and a name to an unnamed one", () => {
        const view = elementIdReviewView("order.bpmn", ROWS, new Set());

        expect(view.groups.slice(3).map((group) => group.rows)).toEqual([
            [
                {
                    id: "flow_inStock",
                    label: "in stock",
                    description: "flow_inStock",
                    tooltip: "The ID already follows the name.",
                    revealId: "flow_inStock",
                },
            ],
            [
                {
                    id: "Flow_2",
                    label: "No name",
                    description: "Flow_2",
                    tooltip: "Add a name to generate the ID from it.",
                    revealId: "Flow_2",
                },
            ],
        ]);
    });

    it("says how many IDs change and that other files keep the old ones", () => {
        const view = elementIdReviewView("order.bpmn", ROWS, new Set(["Process_1"]));

        expect(view).toMatchObject({
            title: "order.bpmn",
            renameCount: 2,
            message:
                "2 of 3 IDs will change. IDs used in other files (call activities, tests, workers) are not updated.",
        });
    });

    it("marks an ID that got a counter because another element has the same name", () => {
        const [clashing] = elementIdReviewView(
            "order.bpmn",
            [row({ id: "Activity_2", newId: "serviceTask_checkStock2", clash: true })],
            new Set(),
        ).groups[0]!.rows;

        expect(clashing?.tooltip).toBe(
            "Check stock: Activity_2 becomes serviceTask_checkStock2. Another element has the same name, so the ID gets a counter.",
        );
    });

    it.each([
        ["every ID follows its name", [ROWS[3]!], "Every ID already follows its name."],
        ["no element has a name", [ROWS[4]!], "No element has a name yet."],
    ])("says so when %s", (_case, rows, message) => {
        expect(elementIdReviewView("order.bpmn", rows, new Set())).toMatchObject({
            message,
            renameCount: 0,
        });
    });
});

describe("the review's other states", () => {
    it("tells a surface that cannot rename to switch modes, with no rows", () => {
        expect(unsupportedReviewView("order.bpmn")).toEqual({
            title: "order.bpmn",
            message: "Switch to Design or Implement mode to generate IDs from names.",
            groups: [],
            renameCount: 0,
        });
    });

    it("keeps the rows of a hidden editor and asks to show it", () => {
        const listed = elementIdReviewView("order.bpmn", ROWS, new Set());

        expect(hiddenEditorReviewView(listed)).toEqual({
            ...listed,
            message: "Show order.bpmn to change its IDs.",
        });
    });
});
