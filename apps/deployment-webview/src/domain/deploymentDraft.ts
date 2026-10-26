export type DraftActivity = "idle" | "switchingTarget" | "reloadingTarget" | "savingTarget";

export interface DraftSnapshot {
    readonly activity: DraftActivity;
    /** "" while the form holds ad-hoc values. */
    readonly editingTargetName: string;
    readonly dirty: boolean;
    readonly credentialsPending: boolean;
    /** Connection or credential-reference edits the selected target has not saved yet. */
    readonly targetDefinitionChanged: boolean;
}

export interface DraftControls {
    readonly saveDisabled: boolean;
    readonly saveTitle: string;
    readonly selectDisabled: boolean;
    readonly newDisabled: boolean;
    readonly deleteDisabled: boolean;
    readonly inputsDisabled: boolean;
}

const ACTIVITY_BLOCKED_REASON: Record<DraftActivity, string | undefined> = {
    idle: undefined,
    savingTarget: "Saving deployment target…",
    switchingTarget: "Loading deployment target…",
    reloadingTarget: "Loading deployment target…",
};

function waitBlockedReason(draft: DraftSnapshot): string | undefined {
    return (
        ACTIVITY_BLOCKED_REASON[draft.activity] ??
        (draft.credentialsPending ? "Loading credentials…" : undefined)
    );
}

export function executionBlockedReason(draft: DraftSnapshot): string | undefined {
    const waitReason = waitBlockedReason(draft);
    if (waitReason !== undefined) return waitReason;
    if (draft.editingTargetName !== "" && draft.targetDefinitionChanged) {
        return "Save target changes before deploying or starting an instance.";
    }
    return undefined;
}

export function saveBlockedReason(draft: DraftSnapshot): string | undefined {
    if (draft.editingTargetName === "") {
        return "Select a target to save changes, or use New to create one.";
    }
    if (!draft.dirty) return "No unsaved changes.";
    return waitBlockedReason(draft);
}

export function draftControls(draft: DraftSnapshot): DraftControls {
    const saveReason = saveBlockedReason(draft);
    const busy = draft.activity !== "idle";
    return {
        saveDisabled: saveReason !== undefined,
        saveTitle: saveReason ?? "Save target",
        selectDisabled: busy,
        newDisabled: busy || draft.credentialsPending,
        deleteDisabled: busy || draft.editingTargetName === "",
        // A save or load in flight is about to replace these values.
        inputsDisabled: busy,
    };
}
