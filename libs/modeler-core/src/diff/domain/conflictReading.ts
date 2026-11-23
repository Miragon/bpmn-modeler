import { MERGE_SIDES, type MergeSide } from "@miragon/bpmn-modeler-types/domain";

import { ConflictStageFacts } from "./conflictFacts";

/** The sides of a conflict the merge view opens; the ancestor is absent when both sides added the file. */
export interface ResolvableStages {
    readonly base?: string;
    readonly current: string;
    readonly incoming: string;
}

/** Whether the merge view can open a conflicted file, and why not. */
export type ConflictReading =
    | { readonly kind: "notBpmn" }
    | { readonly kind: "gitUnavailable" }
    | { readonly kind: "notConflicted" }
    | { readonly kind: "oneSideDeleted"; readonly remainingSide: MergeSide }
    | { readonly kind: "oneSideAdded"; readonly addedSide: MergeSide }
    | { readonly kind: "bothDeleted" }
    | { readonly kind: "resolvable"; readonly stages: ResolvableStages };

/** Whether the merge view opens a file of this name at all, before Git is asked about it. */
export function isMergeViewCandidate(fileName: string): boolean {
    return fileName.toLowerCase().endsWith(".bpmn");
}

/**
 * Reads what Git said about a file: the file name first, since the Source
 * Control row offers the view on every conflicted file; then whether Git
 * answered and lists it; then which sides it holds. It never reads Git's
 * change status, whose numbers differ between VS Code versions.
 */
export function conflictReadingOf(fileName: string, facts: ConflictStageFacts): ConflictReading {
    if (!isMergeViewCandidate(fileName)) return { kind: "notBpmn" };
    if (!facts.gitAvailable) return { kind: "gitUnavailable" };
    if (!facts.inMergeChanges) return { kind: "notConflicted" };
    const { base, current, incoming } = facts.stages;
    if (current !== undefined && incoming !== undefined) {
        return {
            kind: "resolvable",
            stages: base === undefined ? { current, incoming } : { base, current, incoming },
        };
    }
    const onlySide = MERGE_SIDES.find((side) => facts.stages[side] !== undefined);
    if (onlySide !== undefined) {
        return base === undefined
            ? { kind: "oneSideAdded", addedSide: onlySide }
            : { kind: "oneSideDeleted", remainingSide: onlySide };
    }
    return base === undefined ? { kind: "gitUnavailable" } : { kind: "bothDeleted" };
}
