import { ResolvableStages } from "./conflictReading";

/** What a merge view shows of a conflict: its sides and the title that names them. */
export interface MergeViewContent {
    readonly stages: ResolvableStages;
    readonly title: string;
}

export function showsSameConflict(open: MergeViewContent, now: MergeViewContent): boolean {
    return false;
}
