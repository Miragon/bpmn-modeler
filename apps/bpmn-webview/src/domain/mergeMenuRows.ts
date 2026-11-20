import type { MergeHostOffers, MergePaneShapelessRow } from "@miragon/bpmn-modeler-shared";
import type { MergeMarker } from "@miragon/bpmn-modeler-types";

import type { MergeShapelessValues } from "./mergeRowTexts";
import type { MergeCardChoice } from "./mergeCardContent";
import { elementPickOf, type MergeElementPickStates } from "./mergeElementPick";
import { handMergeFactsOf } from "./mergeHandMergeCard";
import { mergeOutcomeCardContent, type MergeRememberedOutcome } from "./mergeOutcomeCard";
import { type MergeRowDecision, mergeRowDecisions, type MergeRowStates } from "./mergePadDecisions";
import type { MergeTranslate } from "./mergeTranslate";

/** What the menu's rows read of the host's states. */
export type MergeMenuRowStates = MergeRowStates & MergeElementPickStates;

/** What the menu's rows say things with and what the host offers. */
interface MergeMenuRowContext {
    readonly nameOf: (id: string) => string;
    readonly translate: MergeTranslate;
    readonly offers: MergeHostOffers;
}

/** A shape-less element as the menu lists it; the menu only renders it. */
export interface MergeMenuRowContent {
    readonly id: string;
    readonly type: string;
    readonly marker: MergeMarker;
    /** Current's name, else incoming's, so a pick keeps the title; the row names the element by its id without one. */
    readonly name?: string;
    readonly values: MergeShapelessValues;
    readonly decisions: readonly MergeRowDecision[];
    /** What the row's last decision did, line by line, on the pane that sent it. */
    readonly outcome?: readonly string[];
    /** What the row's outcome lets the user do next, as the card would. */
    readonly choices?: readonly MergeCardChoice[];
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
    context: MergeMenuRowContext,
): readonly MergeMenuRowContent[] {
    const { offers } = context;
    return states.shapelessRows.map((row) => {
        const name = row.current?.name ?? row.incoming?.name;
        return {
            id: row.id,
            type: row.type,
            marker: row.marker,
            ...(name === undefined ? {} : { name }),
            values: rowValues(row),
            decisions: mergeRowDecisions(states, row, offers),
            ...saidInRow(states, row, outcome, context),
            xmlChanges: offers.elementXmlChanges,
        };
    });
}

/** What a row's last decision did, line by line, in the card's words. */
export function rowOutcomeText(
    states: MergeMenuRowStates,
    outcome: MergeRememberedOutcome,
    context: MergeMenuRowContext,
): readonly string[] {
    return rowOutcomeContent(states, outcome, context).announcement;
}

function saidInRow(
    states: MergeMenuRowStates,
    row: MergePaneShapelessRow,
    outcome: MergeRememberedOutcome | undefined,
    context: MergeMenuRowContext,
): Pick<MergeMenuRowContent, "outcome" | "choices"> {
    if (outcome?.outcome.elementId !== row.id) return {};
    const { announcement, choices } = rowOutcomeContent(states, outcome, context);
    return { outcome: announcement, ...(choices === undefined ? {} : { choices }) };
}

function rowOutcomeContent(
    states: MergeMenuRowStates,
    outcome: MergeRememberedOutcome,
    { offers, ...words }: MergeMenuRowContext,
) {
    return mergeOutcomeCardContent(outcome, {
        ...words,
        restoreOffer: states.restoreOffer,
        handMerge: handMergeFactsOf(elementPickOf(states, outcome.outcome.elementId), offers),
    });
}

function rowValues({
    lackingSide,
    differences,
    moreDiffers,
}: MergePaneShapelessRow): MergeShapelessValues {
    return {
        ...(lackingSide === undefined ? {} : { lackingSide }),
        differences,
        ...(moreDiffers === undefined ? {} : { moreDiffers }),
    };
}

/** The open conflicts the menu lists, which no canvas draws; the "…" button counts them. */
export function openShapelessConflicts(rows: readonly MergePaneShapelessRow[]): number {
    return rows.filter(({ marker }) => marker === "conflict").length;
}
