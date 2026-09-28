import type { LintReport } from "@miragon/bpmn-modeler-types";

/** A report after the vendor's `_formatIssues` regrouped it under the element that displays it. */
export interface ElementIssue extends LintReport {
    readonly isChildIssue?: boolean;
    readonly actualElementId?: string;
}

export type ElementIssues = Record<string, ElementIssue[]>;

export interface ElementIssuesDiff {
    readonly staleElementIds: string[];
    readonly freshElementIds: string[];
}

function issueContentKey(elementIssues: readonly ElementIssue[]): string {
    return JSON.stringify(
        elementIssues.map((issue) => [
            issue.rule,
            issue.category,
            issue.message,
            issue.actualElementId,
            issue.isChildIssue,
            issue.meta?.documentation?.url,
        ]),
    );
}

// An overlay can vanish without a relint (element deleted, undone or replaced), so
// matching content alone does not prove the overlay is still on the canvas.
export function diffElementIssues(
    previous: ElementIssues,
    next: ElementIssues,
    isRendered: (elementId: string) => boolean,
): ElementIssuesDiff {
    const staleElementIds: string[] = [];
    const freshElementIds: string[] = [];
    for (const elementId of Object.keys(previous)) {
        if (next[elementId] === undefined) {
            staleElementIds.push(elementId);
        }
    }
    for (const [elementId, elementIssues] of Object.entries(next)) {
        if (previous[elementId] === undefined) {
            freshElementIds.push(elementId);
        } else if (
            !isRendered(elementId) ||
            issueContentKey(previous[elementId]) !== issueContentKey(elementIssues)
        ) {
            staleElementIds.push(elementId);
            freshElementIds.push(elementId);
        }
    }
    return { staleElementIds, freshElementIds };
}
