import { readConflictMarkers } from "../../kernel/domain/conflictMarkers";
import type { ConfirmRequest } from "../../kernel/domain/prompts";
import { overwriteConfirm, type OverwriteReason } from "./mergeBuildTexts";

/** Whether a build may write over the working file at once, or asks first. */
export type OverwriteDecision =
    { readonly kind: "write" } | { readonly kind: "confirm"; readonly request: ConfirmRequest };

/**
 * A build writes over Git's conflict markers or its own last result without
 * asking: both come back with `git checkout -m` or the next build. It asks
 * before it replaces anything else, unsaved changes first, since the save
 * that follows the replace would lose them.
 */
export function overwriteDecision(
    workingFile: { readonly text: string; readonly isDirty: boolean },
    lastBuiltXml: string | undefined,
    fileName: string,
): OverwriteDecision {
    const reason = overwriteReasonOf(workingFile, lastBuiltXml);
    return reason === undefined
        ? { kind: "write" }
        : { kind: "confirm", request: overwriteConfirm(reason, fileName) };
}

function overwriteReasonOf(
    { text, isDirty }: { readonly text: string; readonly isDirty: boolean },
    lastBuiltXml: string | undefined,
): OverwriteReason | undefined {
    if (isDirty) return "unsavedChanges";
    if (readConflictMarkers(text).hasMarkers || text === lastBuiltXml) return undefined;
    return lastBuiltXml === undefined ? "resolvedElsewhere" : "editedSinceBuild";
}
