import type { MergePaneShapelessRow, MergePaneStates } from "@miragon/bpmn-modeler-shared";
import type { MergeMarker } from "@miragon/bpmn-modeler-types";

import type { MergeShapelessValues } from "./mergeBarTexts";
import { mergeOutcomeCardContent, type MergeRememberedOutcome } from "./mergeOutcomeCard";
import { type MergePadDecision, mergeRowDecisions, type MergeRowStates } from "./mergePadDecisions";
import type { MergeTranslate } from "./mergeTexts";

/** What the menu's rows read of the host's states. */
export type MergeMenuRowStates = MergeRowStates & Pick<MergePaneStates, "shapelessRows">;

/** A shape-less element as the menu lists it; the menu only renders it. */
export interface MergeMenuRowContent {
    readonly id: string;
    readonly type: string;
    readonly marker: MergeMarker;
    /** Current's name, else incoming's, so a pick keeps the title; the row names the element by its id without one. */
    readonly name?: string;
    readonly values: MergeShapelessValues;
    readonly decisions: readonly MergePadDecision[];
    /** What the row's last decision did, line by line, on the pane that sent it. */
    readonly outcome?: readonly string[];
    /** The row opens the element's XML changes, as the pad does; the host shows a side that lacks it as empty. */
    readonly xmlChanges: boolean;
}

/**
 * The menu's rows: each shape-less element with what its sides hold, the
 * decisions the pad's rule offers ({@link mergeRowDecisions}) and, for the
 * row a decision was sent from, what it did in the card's words, since no
 * card shows at an element no canvas draws.
 */
export function mergeMenuRows(
    states: MergeMenuRowStates,
    outcome: MergeRememberedOutcome | undefined,
    context: {
        readonly nameOf: (id: string) => string;
        readonly translate: MergeTranslate;
        /** The host shows an element's XML changes. */
        readonly elementXmlChanges: boolean;
    },
): readonly MergeMenuRowContent[] {
    return states.shapelessRows.map((row) => {
        const name = row.current?.name ?? row.incoming?.name;
        const said =
            outcome?.outcome.elementId === row.id
                ? rowOutcomeText(states, outcome, context)
                : undefined;
        const { lackingSide, differences, moreDiffers } = row;
        return {
            id: row.id,
            type: row.type,
            marker: row.marker,
            ...(name === undefined ? {} : { name }),
            values: {
                ...(lackingSide === undefined ? {} : { lackingSide }),
                differences,
                ...(moreDiffers === undefined ? {} : { moreDiffers }),
            },
            decisions: mergeRowDecisions(states, row),
            ...(said === undefined ? {} : { outcome: said }),
            xmlChanges: context.elementXmlChanges,
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
