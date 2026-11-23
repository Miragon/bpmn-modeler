import type { MeasurementContext } from "../../fitness/domain/fitnessFunction";
import {
    HISTORY_WINDOW_READ_DEPTH,
    type HistoryWindow,
    historyWindow,
    withBaseBranchAsOneChange,
    withBranchAsOneChange,
} from "../domain/commitHistory";
import type { CommitHistory } from "../port/CommitHistory";

/** The history up to the change base as the default branch will hold it once the base lands. */
export function baseHistoryWindow(
    history: CommitHistory,
    { repoRoot, changeBase, defaultBranchBase }: MeasurementContext,
): HistoryWindow {
    const window = historyWindow(
        history.firstParentCommits(repoRoot, defaultBranchBase, HISTORY_WINDOW_READ_DEPTH),
    );
    if (window.kind === "tooShort") {
        return window;
    }
    return {
        kind: "window",
        commits: withBaseBranchAsOneChange(
            window.commits,
            history.changesBetween(repoRoot, defaultBranchBase, changeBase),
        ),
    };
}

/** The base's history with the branch in front, as the default branch will hold it once both land. */
export function branchHistoryWindow(
    history: CommitHistory,
    context: MeasurementContext,
): HistoryWindow {
    const window = baseHistoryWindow(history, context);
    if (window.kind === "tooShort") {
        return window;
    }
    return {
        kind: "window",
        commits: withBranchAsOneChange(
            window.commits,
            history.changesSince(context.repoRoot, context.changeBase),
        ),
    };
}
