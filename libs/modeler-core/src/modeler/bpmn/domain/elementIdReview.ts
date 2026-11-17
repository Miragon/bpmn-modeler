import type { ElementIdProposalsStatus, ElementIdRow } from "@miragon/bpmn-modeler-types";

import {
    elementIdReviewView,
    type ElementIdReviewView,
    hiddenEditorReviewView,
    unsupportedReviewView,
} from "./elementIdReviewView";
import { SWITCH_MODE_TO_GENERATE_IDS } from "./elementIdTexts";

/**
 * The review a host shows in its own panel, of one editor's diagram. Once
 * listed, the core owns which rows are unchecked: the page only lists rows.
 */
export type ElementIdReview =
    | { readonly stage: "closed" }
    // The package decides which rows start unchecked, so the first listing brings them.
    | { readonly stage: "opening"; readonly editorId: string; readonly title: string }
    | {
          readonly stage: "listed";
          readonly editorId: string;
          readonly title: string;
          readonly rows: readonly ElementIdRow[];
          readonly unchecked: ReadonlySet<string>;
      };

type OpenReview = Exclude<ElementIdReview, { stage: "closed" }>;

type ListedReview = Extract<ElementIdReview, { stage: "listed" }>;

export const CLOSED_ELEMENT_ID_REVIEW: ElementIdReview = { stage: "closed" };

export type ElementIdReviewEvent =
    | { readonly type: "generate"; readonly editorId: string; readonly title: string }
    | {
          readonly type: "reported";
          readonly editorId: string;
          readonly status: ElementIdProposalsStatus;
          readonly rows: readonly ElementIdRow[];
          readonly unchecked: readonly string[];
      }
    | { readonly type: "checked"; readonly ids: readonly string[]; readonly checked: boolean }
    | { readonly type: "apply" }
    | { readonly type: "applied"; readonly editorId: string }
    | { readonly type: "discard" }
    | { readonly type: "reveal"; readonly elementId: string }
    | { readonly type: "resumed"; readonly editorId: string }
    | { readonly type: "ended"; readonly editorId: string }
    | { readonly type: "editorHidden"; readonly editorId: string };

/** What the service carries out, in this order. */
export type ElementIdReviewAction =
    | {
          readonly kind: "askForRows";
          readonly editorId: string;
          /** `null` lets the package decide which rows start unchecked. */
          readonly unchecked: readonly string[] | null;
      }
    | { readonly kind: "rename"; readonly editorId: string; readonly unchecked: readonly string[] }
    | { readonly kind: "reveal"; readonly editorId: string; readonly elementId: string }
    | { readonly kind: "stopListing"; readonly editorId: string }
    | { readonly kind: "show"; readonly view: ElementIdReviewView }
    | { readonly kind: "notify"; readonly text: string }
    | { readonly kind: "closePanel" };

export interface ElementIdReviewTransition {
    readonly next: ElementIdReview;
    readonly actions: readonly ElementIdReviewAction[];
}

const unchanged = (review: ElementIdReview): ElementIdReviewTransition => ({
    next: review,
    actions: [],
});

const isOpenOn = (review: ElementIdReview, editorId: string): review is OpenReview =>
    review.stage !== "closed" && review.editorId === editorId;

const listedView = (review: ListedReview): ElementIdReviewView =>
    elementIdReviewView(review.title, review.rows, review.unchecked);

const askForRows = (review: OpenReview): ElementIdReviewAction => ({
    kind: "askForRows",
    editorId: review.editorId,
    unchecked: review.stage === "listed" ? [...review.unchecked] : null,
});

const close = (...after: ElementIdReviewAction[]): ElementIdReviewTransition => ({
    next: CLOSED_ELEMENT_ID_REVIEW,
    actions: [{ kind: "closePanel" }, ...after],
});

function generate(
    review: ElementIdReview,
    editorId: string,
    title: string,
): ElementIdReviewTransition {
    // On the same diagram the choices made so far stay. Not `isOpenOn`: its
    // false branch would narrow `review` to the closed stage.
    if (review.stage !== "closed" && review.editorId === editorId) {
        return { next: review, actions: [askForRows(review)] };
    }
    const next: OpenReview = { stage: "opening", editorId, title };
    return {
        next,
        actions: [
            ...(review.stage === "closed"
                ? []
                : [{ kind: "stopListing", editorId: review.editorId } as const]),
            askForRows(next),
        ],
    };
}

function report(
    review: OpenReview,
    event: Extract<ElementIdReviewEvent, { type: "reported" }>,
): ElementIdReviewTransition {
    if (event.status === "unsupported") {
        return review.stage === "opening"
            ? {
                  next: CLOSED_ELEMENT_ID_REVIEW,
                  actions: [{ kind: "notify", text: SWITCH_MODE_TO_GENERATE_IDS }],
              }
            : {
                  next: review,
                  actions: [{ kind: "show", view: unsupportedReviewView(review.title) }],
              };
    }
    if (review.stage === "opening") {
        const next: ListedReview = {
            ...review,
            stage: "listed",
            rows: event.rows,
            unchecked: new Set(event.unchecked),
        };
        return { next, actions: [{ kind: "show", view: listedView(next) }] };
    }
    // A listing the page sent before a checkbox click must not undo it, so only rows new to the review add to it.
    const added = rowsStartingUnchecked(event.rows, review.rows);
    const next: ListedReview = {
        ...review,
        rows: event.rows,
        unchecked: added.length === 0 ? review.unchecked : new Set([...review.unchecked, ...added]),
    };
    const show: ElementIdReviewAction = { kind: "show", view: listedView(next) };
    // The page drew the new rows as checked, so it lists them again with the review's choice.
    return { next, actions: added.length === 0 ? [show] : [show, askForRows(next)] };
}

function rowsStartingUnchecked(
    rows: readonly ElementIdRow[],
    knownRows: readonly ElementIdRow[],
): string[] {
    const known = new Set(knownRows.map((row) => row.id));
    return rows.filter((row) => row.startsUnchecked && !known.has(row.id)).map((row) => row.id);
}

function check(
    review: ListedReview,
    ids: readonly string[],
    checked: boolean,
): ElementIdReviewTransition {
    const unchecked = new Set(review.unchecked);
    for (const id of ids) {
        if (checked) unchecked.delete(id);
        else unchecked.add(id);
    }
    const next: ListedReview = { ...review, unchecked };
    return { next, actions: [{ kind: "show", view: listedView(next) }, askForRows(next)] };
}

const stay = (
    review: ElementIdReview,
    ...actions: ElementIdReviewAction[]
): ElementIdReviewTransition => ({ next: review, actions });

const whenOpen = (
    review: ElementIdReview,
    act: (open: OpenReview) => ElementIdReviewTransition,
): ElementIdReviewTransition => (review.stage === "closed" ? unchanged(review) : act(review));

const whenOpenOn = (
    review: ElementIdReview,
    editorId: string,
    act: (open: OpenReview) => ElementIdReviewTransition,
): ElementIdReviewTransition => (isOpenOn(review, editorId) ? act(review) : unchanged(review));

const whenListed = (
    review: ElementIdReview,
    act: (listed: ListedReview) => ElementIdReviewTransition,
): ElementIdReviewTransition => (review.stage === "listed" ? act(review) : unchanged(review));

const whenListedOn = (
    review: ElementIdReview,
    editorId: string,
    act: (listed: ListedReview) => ElementIdReviewTransition,
): ElementIdReviewTransition => whenOpenOn(review, editorId, () => whenListed(review, act));

/** The review's next state and what the service does about an event. */
export function reduceElementIdReview(
    review: ElementIdReview,
    event: ElementIdReviewEvent,
): ElementIdReviewTransition {
    switch (event.type) {
        case "generate":
            return generate(review, event.editorId, event.title);
        case "reported":
            return whenOpenOn(review, event.editorId, (open) => report(open, event));
        case "checked":
            return whenListed(review, (listed) => check(listed, event.ids, event.checked));
        case "apply":
            return whenListed(review, (listed) =>
                stay(listed, {
                    kind: "rename",
                    editorId: listed.editorId,
                    unchecked: [...listed.unchecked],
                }),
            );
        case "applied":
        case "ended":
            return whenOpenOn(review, event.editorId, () => close());
        case "discard":
            return whenOpen(review, (open) =>
                close({ kind: "stopListing", editorId: open.editorId }),
            );
        case "reveal":
            return whenOpen(review, (open) =>
                stay(open, { kind: "reveal", editorId: open.editorId, elementId: event.elementId }),
            );
        case "resumed":
            return whenListedOn(review, event.editorId, (listed) =>
                stay(listed, askForRows(listed)),
            );
        case "editorHidden":
            // A hidden editor's page cannot answer until it is shown, so the panel says so.
            return whenListedOn(review, event.editorId, (listed) =>
                stay(listed, { kind: "show", view: hiddenEditorReviewView(listedView(listed)) }),
            );
    }
}
