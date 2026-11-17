import { readConflictMarkers } from "../../kernel/domain/conflictMarkers";
import type { ConfirmRequest } from "../../kernel/domain/prompts";
import { overwriteConfirm, type OverwriteReason } from "./mergeBuildTexts";

/** Whether a build may write over the working file at once, or asks first. */
export type OverwriteDecision =
    { readonly kind: "write" } | { readonly kind: "confirm"; readonly request: ConfirmRequest };

/** The working file's texts a build knows: when the merge view opened, and as the last build saved it. */
export interface WorkingFileHistory {
    readonly opened?: string;
    readonly lastBuilt?: string;
}

/**
 * A build writes over Git's conflict markers as they were when the merge view
 * opened, or over its own last result, without asking: `git checkout -m` or
 * the next build brings either back. It asks before it replaces anything
 * else, unsaved changes first, since the save that follows the replace would
 * lose them. Line endings are no change: an editor or Git may convert them.
 */
export function overwriteDecision(
    workingFile: { readonly text: string; readonly isDirty: boolean },
    history: WorkingFileHistory,
    fileName: string,
): OverwriteDecision {
    const reason = overwriteReasonOf(workingFile, history);
    return reason === undefined
        ? { kind: "write" }
        : { kind: "confirm", request: overwriteConfirm(reason, fileName) };
}

function overwriteReasonOf(
    { text, isDirty }: { readonly text: string; readonly isDirty: boolean },
    { opened, lastBuilt }: WorkingFileHistory,
): OverwriteReason | undefined {
    if (isDirty) return "unsavedChanges";
    if (sameText(text, lastBuilt)) return undefined;
    if (readConflictMarkers(text).hasMarkers) {
        return sameText(text, opened) ? undefined : "editedSinceOpened";
    }
    return lastBuilt === undefined ? "resolvedElsewhere" : "editedSinceBuild";
}

function sameText(text: string, known: string | undefined): boolean {
    return known !== undefined && withLineFeeds(text) === withLineFeeds(known);
}

function withLineFeeds(text: string): string {
    return text.replaceAll("\r\n", "\n");
}
