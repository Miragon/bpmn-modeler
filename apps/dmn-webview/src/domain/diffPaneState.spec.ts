import { describe, expect, it } from "vitest";

import type { DmnDiffView } from "@miragon/bpmn-modeler-shared";
import type { DiffSide } from "@miragon/bpmn-modeler-types";

import {
    type DiffPaneEvent,
    type DiffPaneState,
    INITIAL_DIFF_PANE_STATE,
    legendOf,
    missingCardOf,
    nextDiffPaneState,
    type PaneHighlights,
} from "./diffPaneState";

const TABLE = {
    columns: { added: [], removed: [], changed: [] },
    rules: { added: ["Rule_10"], removed: [], changed: ["Rule_3"], moved: [] },
    cells: ["Out_Cost_3"],
    annotations: [],
    properties: [],
    counts: { added: 1, removed: 1, changed: 1, layoutChanged: 0 },
    navigationOrder: ["Rule_3", "Rule_6", "Rule_10"],
};

/** The after pane's side of a change: Rule_6 and Decision_Surcharge exist only before. */
const VIEW: DmnDiffView = {
    added: ["Input_Insured"],
    removed: [],
    changed: ["Decision_Shipping"],
    layoutChanged: [],
    counts: { added: 1, removed: 1, changed: 1, layoutChanged: 0 },
    navigationOrder: ["Decision_Shipping", "Decision_Surcharge", "Input_Insured"],
    tables: { Decision_Shipping: TABLE },
    expressions: [],
};

const highlights = (
    side: DiffSide = "after",
    origin: PaneHighlights["origin"] = "scm",
): PaneHighlights => ({ side, view: VIEW, origin, paneFilename: "shipping.dmn" });

function run(...events: DiffPaneEvent[]): ReturnType<typeof nextDiffPaneState> {
    let transition: ReturnType<typeof nextDiffPaneState> = { state: INITIAL_DIFF_PANE_STATE };
    for (const event of events) transition = nextDiffPaneState(transition.state, event);
    return transition;
}

const stateAfter = (...events: DiffPaneEvent[]): DiffPaneState => run(...events).state;

const imported = (activeElementId: string | null = null): DiffPaneEvent => ({
    kind: "imported",
    activeElementId,
});
const highlighted = (side?: DiffSide, origin?: PaneHighlights["origin"]): DiffPaneEvent => ({
    kind: "highlighted",
    highlights: highlights(side, origin),
});
const viewEntered = (elementId: string | null, found = true): DiffPaneEvent => ({
    kind: "viewEntered",
    elementId,
    found,
});
const viewRequested = (elementId: string | null): DiffPaneEvent => ({
    kind: "viewRequested",
    elementId,
});

describe("nextDiffPaneState", () => {
    it("starts on the DRD without a file, highlights or a selected change", () => {
        expect(INITIAL_DIFF_PANE_STATE).toEqual({
            imported: false,
            openElement: null,
            missing: false,
            cursor: -1,
        });
    });

    it("imports into the view the viewer opened", () => {
        expect(stateAfter(imported("Decision_Shipping"))).toMatchObject({
            imported: true,
            openElement: "Decision_Shipping",
            missing: false,
        });
    });

    it("ignores a view entered before the import, which the viewer cannot have found", () => {
        const state = stateAfter(highlighted(), viewEntered("Decision_Shipping", false));

        expect(state).toMatchObject({ openElement: null, missing: false });
        expect(missingCardOf(state)).toBeUndefined();
    });

    it("keeps no missing view across the import", () => {
        const state = stateAfter(viewEntered("Decision_Surcharge", false), imported());

        expect(state).toMatchObject({ imported: true, openElement: null, missing: false });
    });

    it("opens the view the partner pane opened once the file is imported", () => {
        expect(run(imported(), viewRequested("Decision_Shipping")).viewToOpen).toEqual({
            elementId: "Decision_Shipping",
        });
    });

    it("holds the view the partner pane opened before the import and opens it after", () => {
        const beforeImport = run(highlighted(), viewRequested("Decision_Shipping"));
        const afterImport = nextDiffPaneState(beforeImport.state, imported());

        expect(beforeImport.viewToOpen).toBeUndefined();
        expect(afterImport.viewToOpen).toEqual({ elementId: "Decision_Shipping" });
        expect(nextDiffPaneState(afterImport.state, imported()).viewToOpen).toBeUndefined();
    });

    it("opens only the partner pane's latest view after the import", () => {
        const { viewToOpen } = run(
            viewRequested("Decision_Shipping"),
            viewRequested(null),
            imported("Decision_Shipping"),
        );

        expect(viewToOpen).toEqual({ elementId: null });
    });

    it("marks a held view the pane's version lacks as missing once it is opened", () => {
        const state = stateAfter(
            highlighted(),
            viewRequested("Decision_Surcharge"),
            imported(),
            viewEntered("Decision_Surcharge", false),
        );

        expect(missingCardOf(state)).toBe("removed");
    });

    it("drops the selected change when highlights arrive or another view opens", () => {
        const stepped = stateAfter(imported(), highlighted(), { kind: "stepped", direction: 1 });

        expect(stepped.cursor).toBe(0);
        expect(nextDiffPaneState(stepped, highlighted()).state.cursor).toBe(-1);
        expect(nextDiffPaneState(stepped, viewEntered("Decision_Shipping")).state.cursor).toBe(-1);
    });

    it("marks a view the pane's version lacks as missing", () => {
        const state = stateAfter(
            imported(),
            highlighted(),
            viewEntered("Decision_Surcharge", false),
        );

        expect(state).toMatchObject({ openElement: "Decision_Surcharge", missing: true });
    });
});

describe("stepping", () => {
    it("steps forward from no selected change to the first and outlines it", () => {
        const { state, target } = run(imported(), highlighted(), { kind: "stepped", direction: 1 });

        expect(state.cursor).toBe(0);
        expect(target).toEqual({ focus: "Decision_Shipping" });
    });

    it("steps back from no selected change to the last", () => {
        const { state, target } = run(imported(), highlighted(), {
            kind: "stepped",
            direction: -1,
        });

        expect(state.cursor).toBe(2);
        expect(target).toEqual({ focus: "Input_Insured" });
    });

    it("anchors on a neighbour for a change only the partner's version has", () => {
        const { target } = run(imported("Decision_Shipping"), highlighted(), {
            kind: "cursorMoved",
            index: 1,
            direction: 1,
        });

        expect(target).toEqual({ anchor: "Rule_10" });
    });

    it.each([
        ["before the highlights", [imported()]],
        [
            "in a missing view",
            [imported(), highlighted(), viewEntered("Decision_Surcharge", false)],
        ],
        ["in a view without changes", [imported(), highlighted(), viewEntered("Decision_Other")]],
    ])("does not step %s", (_case, events) => {
        const { state, target } = run(...events, { kind: "stepped", direction: 1 });

        expect(state.cursor).toBe(-1);
        expect(target).toBeUndefined();
    });

    it.each([3, -1])("ignores the partner's cursor %i, which is out of range", (index) => {
        const { state, target } = run(imported(), highlighted(), {
            kind: "cursorMoved",
            index,
            direction: 1,
        });

        expect(state.cursor).toBe(-1);
        expect(target).toBeUndefined();
    });
});

describe("missingCardOf", () => {
    it.each([
        ["after", "removed"],
        ["before", "added"],
    ] as const)("names a view the %s pane lacks as %s", (side, status) => {
        const state = stateAfter(imported(), highlighted(side), viewEntered("Decision_X", false));

        expect(missingCardOf(state)).toBe(status);
    });

    it("holds the card until the highlights say which side the pane is", () => {
        const missingBeforeHighlights = stateAfter(imported(), viewEntered("Decision_X", false));

        expect(missingCardOf(missingBeforeHighlights)).toBeUndefined();
        expect(missingCardOf(nextDiffPaneState(missingBeforeHighlights, highlighted()).state)).toBe(
            "removed",
        );
    });

    it("shows no card for a view the pane has", () => {
        expect(missingCardOf(stateAfter(imported(), highlighted()))).toBeUndefined();
    });
});

describe("legendOf", () => {
    it.each([
        ["before the import", [highlighted()]],
        ["before the highlights", [imported()]],
    ])("shows nothing %s", (_case, events) => {
        expect(legendOf(stateAfter(...events), undefined)).toBeUndefined();
    });

    it("counts the DRD's changes, with no status of its own", () => {
        expect(legendOf(stateAfter(imported(), highlighted()), "changed")).toEqual({
            counts: VIEW.counts,
            status: undefined,
            filename: undefined,
            showSwap: false,
            canStep: true,
        });
    });

    it("counts the open table's changes and names the open view's status", () => {
        const state = stateAfter(imported(), highlighted(), viewEntered("Decision_Shipping"));

        expect(legendOf(state, "added")).toMatchObject({
            counts: TABLE.counts,
            status: "added",
            canStep: true,
        });
    });

    it("names a missing view by the pane's side and cannot step", () => {
        const state = stateAfter(
            imported(),
            highlighted(),
            viewEntered("Decision_Shipping", false),
        );

        expect(legendOf(state, "changed")).toMatchObject({
            counts: undefined,
            status: "removed",
            canStep: false,
        });
    });

    it("names the file and offers the swap on a compare-files pane", () => {
        const state = stateAfter(imported(), highlighted("after", "compare-files"));

        expect(legendOf(state, undefined)).toMatchObject({
            filename: "shipping.dmn",
            showSwap: true,
        });
    });
});
