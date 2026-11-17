import type { MergePaneShapelessRow, MergePaneStates } from "@miragon/bpmn-modeler-shared";
import type { MergeMarker } from "@miragon/bpmn-modeler-types";

import { mergeOutcomeCardContent, type MergeRememberedOutcome } from "./mergeOutcomeCard";
import { type MergePadDecision, mergeRowDecisions, type MergeRowStates } from "./mergePadDecisions";
import type { MergeTranslate } from "./mergeTexts";

/** What the menu's rows read of the host's states. */
export type MergeMenuRowStates = MergeRowStates & Pick<MergePaneStates, "shapelessRows" | "names">;

/** A shape-less element as the menu lists it; the menu only renders it. */
export interface MergeMenuRowContent {
    readonly id: string;
    readonly type: string;
    readonly marker: MergeMarker;
    /** The host's name; the row names the element by its id without one. */
    readonly name?: string;
    readonly decisions: readonly MergePadDecision[];
    /** What the row's last decision did, line by line, on the pane that sent it. */
    readonly outcome?: readonly string[];
}

/**
 * The menu's rows: each shape-less element with the decisions the pad's rule
 * offers ({@link mergeRowDecisions}) and, for the row a decision was sent
 * from, what it did in the card's words, since no card shows at an element
 * no canvas draws.
 */
export function mergeMenuRows(
    states: MergeMenuRowStates,
    outcome: MergeRememberedOutcome | undefined,
    context: { readonly nameOf: (id: string) => string; readonly translate: MergeTranslate },
): readonly MergeMenuRowContent[] {
    return states.shapelessRows.map((row) => {
        const name = states.names[row.id];
        const said =
            outcome?.outcome.elementId === row.id
                ? rowOutcomeText(states, outcome, context)
                : undefined;
        return {
            id: row.id,
            type: row.type,
            marker: row.marker,
            ...(name === undefined ? {} : { name }),
            decisions: mergeRowDecisions(states, row),
            ...(said === undefined ? {} : { outcome: said }),
        };
    });
}

/** What a row's last decision did, line by line, in the card's words. */
export function rowOutcomeText(
    states: MergeRowStates,
    outcome: MergeRememberedOutcome,
    context: { readonly nameOf: (id: string) => string; readonly translate: MergeTranslate },
): readonly string[] {
    return mergeOutcomeCardContent(outcome, { ...context, restoreOffer: states.restoreOffer })
        .announcement;
}

/** The open conflicts the menu lists, which no canvas draws; the "…" button counts them. */
export function openShapelessConflicts(rows: readonly MergePaneShapelessRow[]): number {
    return rows.filter(({ marker }) => marker === "conflict").length;
}
