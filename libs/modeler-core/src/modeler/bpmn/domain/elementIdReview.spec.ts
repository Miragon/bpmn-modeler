import { describe, expect, it } from "vitest";

import type { ElementIdRow } from "@miragon/bpmn-modeler-types";

import {
    CLOSED_ELEMENT_ID_REVIEW,
    type ElementIdReview,
    type ElementIdReviewAction,
    type ElementIdReviewEvent,
    reduceElementIdReview,
} from "./elementIdReview";
import {
    elementIdReviewView,
    hiddenEditorReviewView,
    unsupportedReviewView,
} from "./elementIdReviewView";
import { SWITCH_MODE_TO_GENERATE_IDS } from "./elementIdTexts";

const ROWS: ElementIdRow[] = [
    {
        id: "Process_1",
        name: "Order fulfilment",
        type: "bpmn:Process",
        kind: "process",
        status: "unchecked",
        newId: "orderFulfilment",
        clash: false,
        shownId: "Process_1",
        startsUnchecked: true,
    },
    {
        id: "Activity_1",
        name: "Check stock",
        type: "bpmn:ServiceTask",
        kind: "activity",
        status: "rename",
        newId: "serviceTask_checkStock",
        clash: false,
        shownId: "Activity_1",
        startsUnchecked: false,
    },
];

// A pool added while the review is open: the page lists its process with the
// unchecked rows it holds, which do not name it yet.
const ADDED_PROCESS: ElementIdRow = {
    id: "Process_2",
    name: "Shipping",
    type: "bpmn:Process",
    kind: "process",
    status: "rename",
    newId: "shipping",
    clash: false,
    shownId: "Participant_2",
    startsUnchecked: true,
};
const ROWS_WITH_ADDED_PROCESS = [...ROWS, ADDED_PROCESS];

const OPENING: ElementIdReview = { stage: "opening", editorId: "order", title: "order.bpmn" };
const LISTED: ElementIdReview = {
    stage: "listed",
    editorId: "order",
    title: "order.bpmn",
    rows: ROWS,
    unchecked: new Set(["Process_1"]),
    everListed: new Set(["Process_1", "Activity_1"]),
};
const BOTH_UNCHECKED: ElementIdReview = {
    ...LISTED,
    unchecked: new Set(["Process_1", "Activity_1"]),
};

const listing = (
    editorId: string,
    unchecked: readonly string[] = ["Process_1"],
): ElementIdReviewEvent => ({
    type: "reported",
    editorId,
    status: "listed",
    rows: ROWS,
    unchecked,
});
const unsupported: ElementIdReviewEvent = {
    type: "reported",
    editorId: "order",
    status: "unsupported",
    rows: [],
    unchecked: [],
};
const show = (unchecked: readonly string[]): ElementIdReviewAction => ({
    kind: "show",
    view: elementIdReviewView("order.bpmn", ROWS, new Set(unchecked)),
});

interface Row {
    readonly name: string;
    readonly review: ElementIdReview;
    readonly event: ElementIdReviewEvent;
    readonly next: ElementIdReview;
    readonly actions: readonly ElementIdReviewAction[];
}

const ROWS_OF_TRANSITIONS: Row[] = [
    {
        name: "opens on a diagram and lets the package decide what starts unchecked",
        review: CLOSED_ELEMENT_ID_REVIEW,
        event: { type: "generate", editorId: "order", title: "order.bpmn" },
        next: OPENING,
        actions: [{ kind: "askForRows", editorId: "order", unchecked: null }],
    },
    {
        name: "keeps the choices and brings the panel up when it runs again on the same diagram",
        review: BOTH_UNCHECKED,
        event: { type: "generate", editorId: "order", title: "order.bpmn" },
        next: BOTH_UNCHECKED,
        actions: [
            { kind: "focusPanel" },
            { kind: "askForRows", editorId: "order", unchecked: ["Process_1", "Activity_1"] },
        ],
    },
    {
        name: "brings the panel up with the first listing when it runs again before it",
        review: OPENING,
        event: { type: "generate", editorId: "order", title: "order.bpmn" },
        next: OPENING,
        actions: [{ kind: "askForRows", editorId: "order", unchecked: null }],
    },
    {
        name: "moves to another diagram, and the first one stops listing",
        review: LISTED,
        event: { type: "generate", editorId: "other", title: "other.bpmn" },
        next: { stage: "opening", editorId: "other", title: "other.bpmn" },
        actions: [
            { kind: "stopListing", editorId: "order" },
            { kind: "askForRows", editorId: "other", unchecked: null },
        ],
    },
    {
        name: "takes the rows that start unchecked from the first listing and brings the panel up",
        review: OPENING,
        event: listing("order"),
        next: LISTED,
        actions: [show(["Process_1"]), { kind: "focusPanel" }],
    },
    {
        name: "keeps its own unchecked rows over a later listing's",
        review: BOTH_UNCHECKED,
        event: listing("order", ["Process_1"]),
        next: BOTH_UNCHECKED,
        actions: [show(["Process_1", "Activity_1"])],
    },
    {
        name: "keeps a process that appears after the first listing unchecked and lists again",
        review: LISTED,
        event: {
            type: "reported",
            editorId: "order",
            status: "listed",
            rows: ROWS_WITH_ADDED_PROCESS,
            unchecked: ["Process_1"],
        },
        next: {
            ...LISTED,
            rows: ROWS_WITH_ADDED_PROCESS,
            unchecked: new Set(["Process_1", "Process_2"]),
            everListed: new Set(["Process_1", "Activity_1", "Process_2"]),
        },
        actions: [
            {
                kind: "show",
                view: elementIdReviewView(
                    "order.bpmn",
                    ROWS_WITH_ADDED_PROCESS,
                    new Set(["Process_1", "Process_2"]),
                ),
            },
            { kind: "askForRows", editorId: "order", unchecked: ["Process_1", "Process_2"] },
        ],
    },
    {
        name: "leaves a process the user checked checked",
        review: { ...LISTED, unchecked: new Set() },
        event: listing("order", []),
        next: { ...LISTED, unchecked: new Set() },
        actions: [show([])],
    },
    {
        name: "tells an editor whose review it is not to stop listing",
        review: LISTED,
        event: listing("other"),
        next: LISTED,
        actions: [{ kind: "stopListing", editorId: "other" }],
    },
    {
        // Such as a page that kept listing across a bridge respawn.
        name: "tells an editor to stop listing once it is closed",
        review: CLOSED_ELEMENT_ID_REVIEW,
        event: listing("order"),
        next: CLOSED_ELEMENT_ID_REVIEW,
        actions: [{ kind: "stopListing", editorId: "order" }],
    },
    {
        // The panel may still show the diagram the review moved away from.
        name: "closes the panel, tells the user to switch modes and stops the editor listing when the review cannot open",
        review: OPENING,
        event: unsupported,
        next: CLOSED_ELEMENT_ID_REVIEW,
        actions: [
            { kind: "closePanel" },
            { kind: "notify", text: SWITCH_MODE_TO_GENERATE_IDS },
            { kind: "stopListing", editorId: "order" },
        ],
    },
    {
        name: "says so in the panel when the editor leaves the modes that change IDs",
        review: LISTED,
        event: unsupported,
        next: LISTED,
        actions: [{ kind: "show", view: unsupportedReviewView("order.bpmn") }],
    },
    {
        name: "shows an unchecked row at once and asks for the rows again",
        review: LISTED,
        event: { type: "checked", ids: ["Activity_1"], checked: false },
        next: BOTH_UNCHECKED,
        actions: [
            show(["Process_1", "Activity_1"]),
            { kind: "askForRows", editorId: "order", unchecked: ["Process_1", "Activity_1"] },
        ],
    },
    {
        name: "checks rows again",
        review: BOTH_UNCHECKED,
        event: { type: "checked", ids: ["Activity_1"], checked: true },
        next: LISTED,
        actions: [
            show(["Process_1"]),
            { kind: "askForRows", editorId: "order", unchecked: ["Process_1"] },
        ],
    },
    {
        name: "has no checkboxes before the first listing",
        review: OPENING,
        event: { type: "checked", ids: ["Activity_1"], checked: false },
        next: OPENING,
        actions: [],
    },
    {
        name: "renames every row the user left checked",
        review: LISTED,
        event: { type: "apply" },
        next: LISTED,
        actions: [{ kind: "rename", editorId: "order", unchecked: ["Process_1"] }],
    },
    {
        name: "renames nothing before the first listing",
        review: OPENING,
        event: { type: "apply" },
        next: OPENING,
        actions: [],
    },
    {
        name: "closes the panel once the editor renamed the IDs",
        review: LISTED,
        event: { type: "applied", editorId: "order" },
        next: CLOSED_ELEMENT_ID_REVIEW,
        actions: [{ kind: "closePanel" }],
    },
    {
        name: "keeps the panel when another editor reports a rename",
        review: LISTED,
        event: { type: "applied", editorId: "other" },
        next: LISTED,
        actions: [],
    },
    {
        name: "discards: the panel closes and the editor stops listing",
        review: OPENING,
        event: { type: "discard" },
        next: CLOSED_ELEMENT_ID_REVIEW,
        actions: [{ kind: "closePanel" }, { kind: "stopListing", editorId: "order" }],
    },
    {
        name: "has nothing to discard once closed",
        review: CLOSED_ELEMENT_ID_REVIEW,
        event: { type: "discard" },
        next: CLOSED_ELEMENT_ID_REVIEW,
        actions: [],
    },
    {
        name: "reveals a row's element in its editor",
        review: OPENING,
        event: { type: "reveal", elementId: "Activity_1" },
        next: OPENING,
        actions: [{ kind: "reveal", editorId: "order", elementId: "Activity_1" }],
    },
    {
        name: "reveals nothing once closed",
        review: CLOSED_ELEMENT_ID_REVIEW,
        event: { type: "reveal", elementId: "Activity_1" },
        next: CLOSED_ELEMENT_ID_REVIEW,
        actions: [],
    },
    {
        name: "asks a restarted page for the rows again",
        review: BOTH_UNCHECKED,
        event: { type: "resumed", editorId: "order" },
        next: BOTH_UNCHECKED,
        actions: [
            { kind: "askForRows", editorId: "order", unchecked: ["Process_1", "Activity_1"] },
        ],
    },
    {
        name: "asks no restarted page without a listed review",
        review: OPENING,
        event: { type: "resumed", editorId: "order" },
        next: OPENING,
        actions: [],
    },
    {
        name: "asks no other restarted page",
        review: LISTED,
        event: { type: "resumed", editorId: "other" },
        next: LISTED,
        actions: [],
    },
    {
        name: "closes the panel with its editor",
        review: OPENING,
        event: { type: "ended", editorId: "order" },
        next: CLOSED_ELEMENT_ID_REVIEW,
        actions: [{ kind: "closePanel" }],
    },
    {
        name: "keeps the panel when another editor closes",
        review: LISTED,
        event: { type: "ended", editorId: "other" },
        next: LISTED,
        actions: [],
    },
    {
        name: "asks the user to show a hidden editor and keeps the choices",
        review: BOTH_UNCHECKED,
        event: { type: "editorHidden", editorId: "order" },
        next: BOTH_UNCHECKED,
        actions: [
            {
                kind: "show",
                view: hiddenEditorReviewView(
                    elementIdReviewView("order.bpmn", ROWS, new Set(["Process_1", "Activity_1"])),
                ),
            },
        ],
    },
    {
        name: "shows nothing for a hidden editor before the first listing",
        review: OPENING,
        event: { type: "editorHidden", editorId: "order" },
        next: OPENING,
        actions: [],
    },
    {
        name: "shows nothing for a hidden editor whose review it is not",
        review: LISTED,
        event: { type: "editorHidden", editorId: "other" },
        next: LISTED,
        actions: [],
    },
];

describe("reduceElementIdReview", () => {
    it.each(ROWS_OF_TRANSITIONS)("$name", ({ review, event, next, actions }) => {
        expect(reduceElementIdReview(review, event)).toEqual({ next, actions });
    });

    it("leaves a process the user checked checked when its pool is deleted and restored", () => {
        const poolDeleted: ElementIdReviewEvent = {
            type: "reported",
            editorId: "order",
            status: "listed",
            rows: ROWS.filter((row) => row.id !== "Process_1"),
            unchecked: [],
        };
        const checked: ElementIdReview = { ...LISTED, unchecked: new Set() };

        const deleted = reduceElementIdReview(checked, poolDeleted).next;
        const restored = reduceElementIdReview(deleted, listing("order", []));

        expect(restored).toMatchObject({ next: { unchecked: new Set() }, actions: [show([])] });
    });
});
