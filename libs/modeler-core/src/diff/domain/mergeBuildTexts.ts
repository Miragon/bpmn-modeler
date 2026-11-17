import type { ConfirmRequest } from "../../kernel/domain/prompts";

/** Why a build asks before it writes over the working file. */
export type OverwriteReason =
    "unsavedChanges" | "resolvedElsewhere" | "editedSinceOpened" | "editedSinceBuild";

const OVERWRITE_TEXTS: Record<OverwriteReason, { title: string; detail: string }> = {
    unsavedChanges: {
        title: "{file} has unsaved changes. Build over them?",
        detail: "Building replaces the whole file with the merge result and saves it, so the unsaved changes are lost.",
    },
    resolvedElsewhere: {
        title: "{file} holds no conflict markers. Build over it?",
        detail: "It was resolved another way, or another merge tool changed it. Building replaces it with the merge result.",
    },
    editedSinceOpened: {
        title: "{file} changed since the merge view opened. Build over it?",
        detail: "Building replaces those changes, also any conflict you resolved by hand, with the merge result.",
    },
    editedSinceBuild: {
        title: "{file} changed since the last build. Build over it?",
        detail: "Building replaces those changes with a new merge result.",
    },
};

/** The question a build asks before it replaces what the user may want to keep. */
export function overwriteConfirm(reason: OverwriteReason, fileName: string): ConfirmRequest {
    const { title, detail } = OVERWRITE_TEXTS[reason];
    return {
        id: `mergeBuild.${reason}`,
        title: title.replace("{file}", fileName),
        confirmLabel: "Build",
        details: [
            detail,
            `Until you stage ${fileName}, "git checkout -m -- ${fileName}" brings back Git's conflict markers.`,
        ],
    };
}

/** Why Build does nothing while conflicts are open. */
export function buildRefusalText(fileName: string, openConflicts: number): string {
    const conflicts =
        openConflicts === 1 ? "the open conflict" : `the ${openConflicts} open conflicts`;
    return `Decide ${conflicts} of ${fileName} before you build it.`;
}

/** A build the merge refused, with its reason, which names the elements by id. */
export function buildFailureText(fileName: string, error: Error): string {
    return `Cannot build ${fileName}, so it stays as it was: ${error.message}`;
}

export function readFailureText(fileName: string, error: Error): string {
    return `Cannot read ${fileName}, so nothing was built: ${error.message}`;
}

export function compareFailureText(fileName: string, error: Error): string {
    return `Cannot compare the merge result of ${fileName}: ${error.message}`;
}

export function writeFailureText(fileName: string, error: Error): string {
    return `Cannot write the merge result to ${fileName}: ${error.message}`;
}

/** Shown once the merge result is in the working file. */
export function buildDoneNotice(fileName: string, noteCount: number): string {
    const notes =
        noteCount === 0
            ? ""
            : ` and the ${noteCount} ${noteCount === 1 ? "note" : "notes"} in the merge view`;
    return `Built ${fileName} from your decisions. Review it${notes}, then stage it to mark the conflict resolved.`;
}
