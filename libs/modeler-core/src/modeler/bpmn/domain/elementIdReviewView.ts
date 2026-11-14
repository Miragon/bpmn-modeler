import {
    ELEMENT_ID_GROUPS,
    type ElementIdRow,
    isChangingStatus,
} from "@miragon/bpmn-modeler-types";

import { SWITCH_MODE_TO_GENERATE_IDS } from "./elementIdTexts";

export interface ElementIdReviewRowView {
    /** The current ID, which names the row in the panel's actions. */
    readonly id: string;
    readonly label: string;
    readonly description: string;
    readonly tooltip: string;
    /** Absent on a row that keeps its ID either way: it already matches or has no name. */
    readonly checked?: boolean;
    /** The diagram element a click reveals: a pool for its process. */
    readonly revealId: string;
}

export interface ElementIdReviewGroupView {
    /** The kind, or `matches` and `skipped` for the rows without a checkbox. */
    readonly id: string;
    readonly label: string;
    /** Absent on a group whose rows have no checkbox. */
    readonly checked?: boolean;
    readonly collapsed: boolean;
    readonly rows: readonly ElementIdReviewRowView[];
}

/** What a host's review panel shows; the core writes every text. */
export interface ElementIdReviewView {
    /** The diagram's file name. */
    readonly title: string;
    /** One line above the rows: what Apply does, or why the review cannot rename. */
    readonly message: string;
    readonly groups: readonly ElementIdReviewGroupView[];
    /** How many IDs Apply renames; with none, the panel offers no Apply. */
    readonly renameCount: number;
}

const OTHER_FILES_NOTE =
    "IDs used in other files (call activities, tests, workers) are not updated.";

const isChanging = (row: ElementIdRow) => isChangingStatus(row.status);

function changingRow(row: ElementIdRow, unchecked: ReadonlySet<string>): ElementIdReviewRowView {
    const change = `${row.id} becomes ${row.newId ?? ""}`;
    return {
        id: row.id,
        label: row.name,
        description: `${row.id} → ${row.newId ?? ""}`,
        tooltip: row.clash
            ? `${row.name}: ${change}. Another element has the same name, so the ID gets a counter.`
            : `${row.name}: ${change}`,
        checked: !unchecked.has(row.id),
        revealId: row.shownId,
    };
}

function keptRow(row: ElementIdRow, tooltip: string): ElementIdReviewRowView {
    return {
        id: row.id,
        label: row.name || "No name",
        description: row.id,
        tooltip,
        revealId: row.shownId,
    };
}

function emptyMessage(rows: readonly ElementIdRow[]): string {
    return rows.some((row) => row.status === "matches")
        ? "Every ID already follows its name."
        : "No element has a name yet.";
}

/**
 * The review of a listed diagram. Checkboxes follow `unchecked` rather than
 * each row's status, so a change shows before the editor lists the rows again.
 */
export function elementIdReviewView(
    title: string,
    rows: readonly ElementIdRow[],
    unchecked: ReadonlySet<string>,
): ElementIdReviewView {
    const changing = rows.filter(isChanging);
    const renameCount = changing.filter((row) => !unchecked.has(row.id)).length;
    const kindGroups = ELEMENT_ID_GROUPS.flatMap(({ kind, label }): ElementIdReviewGroupView[] => {
        const groupRows = changing
            .filter((row) => row.kind === kind)
            .map((row) => changingRow(row, unchecked));
        return groupRows.length === 0
            ? []
            : [
                  {
                      id: kind,
                      label,
                      checked: groupRows.every((row) => row.checked),
                      collapsed: false,
                      rows: groupRows,
                  },
              ];
    });
    const keptGroups = [
        { id: "matches", label: "Already match", tooltip: "The ID already follows the name." },
        {
            id: "skipped",
            label: "No name, skipped",
            tooltip: "Add a name to generate the ID from it.",
        },
    ].flatMap(({ id, label, tooltip }): ElementIdReviewGroupView[] => {
        const groupRows = rows
            .filter((row) => row.status === id)
            .map((row) => keptRow(row, tooltip));
        return groupRows.length === 0 ? [] : [{ id, label, collapsed: true, rows: groupRows }];
    });
    return {
        title,
        message:
            changing.length === 0
                ? emptyMessage(rows)
                : `${renameCount} of ${changing.length} IDs will change. ${OTHER_FILES_NOTE}`,
        groups: [...kindGroups, ...keptGroups],
        renameCount,
    };
}

export function unsupportedReviewView(title: string): ElementIdReviewView {
    return { title, message: SWITCH_MODE_TO_GENERATE_IDS, groups: [], renameCount: 0 };
}

/** A hidden editor's page cannot list or rename until it is shown again. */
export function hiddenEditorReviewView(view: ElementIdReviewView): ElementIdReviewView {
    return { ...view, message: `Show ${view.title} to change its IDs.` };
}
