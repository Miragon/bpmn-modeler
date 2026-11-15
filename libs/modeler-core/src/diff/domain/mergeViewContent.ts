import { ResolvableStages } from "./conflictReading";

/** What a merge view shows of a conflict: its sides and the title that names them. */
export interface MergeViewContent {
    readonly stages: ResolvableStages;
    readonly title: string;
}

/** Whether an open merge view still shows the conflict Git holds now, so opening the file focuses it. */
export function showsSameConflict(open: MergeViewContent, now: MergeViewContent): boolean {
    return (
        open.title === now.title &&
        open.stages.base === now.stages.base &&
        open.stages.current === now.stages.current &&
        open.stages.incoming === now.stages.incoming
    );
}
