import type { DmnDiffView } from "@miragon/bpmn-modeler-shared";
import {
    canStep,
    type DiffLegendState as SharedDiffLegendState,
    type DiffOrigin,
    type DiffSide,
    stepCursor,
} from "@miragon/bpmn-modeler-types";
import type { DmnDiffStatus } from "@miragon/dmn-modeler";

import {
    countsOf,
    type DmnMissingStatus,
    missingStatusOf,
    presentIn,
    type StepTarget,
    stepsOf,
    targetAt,
} from "./diffSteps";

/** What the host has one DMN diff pane highlight, and how the pane presents itself. */
export interface PaneHighlights {
    readonly side: DiffSide;
    readonly view: DmnDiffView;
    readonly origin: DiffOrigin;
    readonly paneFilename: string;
}

export interface DiffPaneState {
    readonly imported: boolean;
    /** Held from their arrival; the pane paints them once its file is imported. */
    readonly highlights?: PaneHighlights;
    /** The open view: `null` for the DRD, else its element's id. */
    readonly openElement: string | null;
    /** The partner pane opened a view this pane's version lacks. */
    readonly missing: boolean;
    /** The selected change among the open view's steps; `-1` for none. */
    readonly cursor: number;
    /** The view the partner pane opened before this pane's file was imported. */
    readonly heldView?: ViewRequest;
}

/** A view to open: `null` for the DRD, else its element's id. */
export interface ViewRequest {
    readonly elementId: string | null;
}

export type DiffPaneEvent =
    | { readonly kind: "imported"; readonly activeElementId: string | null }
    | { readonly kind: "highlighted"; readonly highlights: PaneHighlights }
    | { readonly kind: "viewRequested"; readonly elementId: string | null }
    | { readonly kind: "viewEntered"; readonly elementId: string | null; readonly found: boolean }
    | { readonly kind: "stepped"; readonly direction: 1 | -1 }
    | { readonly kind: "cursorMoved"; readonly index: number; readonly direction: 1 | -1 }
    | { readonly kind: "shownWhole" };

export interface DiffPaneTransition {
    readonly state: DiffPaneState;
    /** What the pane outlines, or brings into view, for the change the cursor moved to. */
    readonly target?: StepTarget;
    /** The view the pane opens in its viewer. */
    readonly viewToOpen?: ViewRequest;
}

/** What the legend over a DMN diff pane shows; a view without a changed table shows `status`. */
export type DiffLegendState = Omit<SharedDiffLegendState, "status"> & {
    readonly status?: DmnDiffStatus;
};

export const INITIAL_DIFF_PANE_STATE: DiffPaneState = {
    imported: false,
    openElement: null,
    missing: false,
    cursor: -1,
};

export function nextDiffPaneState(state: DiffPaneState, event: DiffPaneEvent): DiffPaneTransition {
    switch (event.kind) {
        case "imported":
            return {
                state: {
                    ...state,
                    imported: true,
                    openElement: event.activeElementId,
                    missing: false,
                    cursor: -1,
                    heldView: undefined,
                },
                viewToOpen: state.heldView,
            };
        case "highlighted":
            return { state: { ...state, highlights: event.highlights, cursor: -1 } };
        case "viewRequested": {
            const request = { elementId: event.elementId };
            // Before the import the viewer has no views to open it in.
            if (!state.imported) return { state: { ...state, heldView: request } };
            return { state, viewToOpen: request };
        }
        case "viewEntered":
            // Before the import the viewer has no views, so its "not found" says nothing.
            if (!state.imported) return { state };
            return {
                state: {
                    ...state,
                    openElement: event.elementId,
                    missing: !event.found,
                    cursor: -1,
                },
            };
        case "stepped": {
            const steps = stepsInView(state);
            if (!canStep(steps)) return { state };
            const index = stepCursor(state.cursor, event.direction, steps.length);
            return cursorMoved(state, index, event.direction);
        }
        case "cursorMoved":
            return cursorMoved(state, event.index, event.direction);
        case "shownWhole":
            return { state: { ...state, cursor: -1 } };
    }
}

/** The card a pane shows instead of a view its version lacks, once it knows its side. */
export function missingCardOf(state: DiffPaneState): DmnMissingStatus | undefined {
    return state.missing && state.highlights ? missingStatusOf(state.highlights.side) : undefined;
}

/**
 * The legend for the open view, once the pane has its file and highlights.
 * `openViewStatus` is how the viewer marks the open element.
 */
export function legendOf(
    state: DiffPaneState,
    openViewStatus: DmnDiffStatus | undefined,
): DiffLegendState | undefined {
    const highlights = state.highlights;
    if (!state.imported || !highlights) return undefined;
    const isCompareFiles = highlights.origin === "compare-files";
    // Both panes draw the bar; the after pane's half carries the changes, and the
    // before pane's missing view still shows its card.
    const isAfter = highlights.side === "after";
    return {
        counts: state.missing ? undefined : countsOf(highlights.view, state.openElement),
        status: missingCardOf(state) ?? (state.openElement === null ? undefined : openViewStatus),
        showSwap: isCompareFiles && isAfter,
        canStep: canStep(stepsInView(state)),
        showChanges: isAfter,
    };
}

function cursorMoved(state: DiffPaneState, index: number, direction: 1 | -1): DiffPaneTransition {
    const view = state.highlights?.view;
    const steps = stepsInView(state);
    if (!view || index < 0 || index >= steps.length) return { state };
    return {
        state: { ...state, cursor: index },
        target: targetAt(steps, presentIn(view, state.openElement), index, direction),
    };
}

/** The changes the stepper walks: none before the file and highlights, or in a missing view. */
function stepsInView(state: DiffPaneState): readonly string[] {
    const view = state.highlights?.view;
    return state.imported && view && !state.missing ? stepsOf(view, state.openElement) : [];
}
