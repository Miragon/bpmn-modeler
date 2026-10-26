import { describe, expect, it } from "vitest";
import {
    type DraftActivity,
    type DraftControls,
    type DraftSnapshot,
    draftControls,
    executionBlockedReason,
    saveBlockedReason,
} from "./deploymentDraft";

const SAVING = "Saving deployment target…";
const LOADING_TARGET = "Loading deployment target…";
const LOADING_CREDENTIALS = "Loading credentials…";
const SAVE_FIRST = "Save target changes before deploying or starting an instance.";
const NO_TARGET = "Select a target to save changes, or use New to create one.";
const NO_CHANGES = "No unsaved changes.";

const idleNamedDraft: DraftSnapshot = {
    activity: "idle",
    editingTargetName: "dev",
    dirty: true,
    credentialsPending: false,
    targetDefinitionChanged: false,
};
const draft = (overrides: Partial<DraftSnapshot>): DraftSnapshot => ({
    ...idleNamedDraft,
    ...overrides,
});

const ACTIVITIES: DraftActivity[] = ["idle", "switchingTarget", "reloadingTarget", "savingTarget"];
const everyDraft: DraftSnapshot[] = ACTIVITIES.flatMap((activity) =>
    ["", "dev"].flatMap((editingTargetName) =>
        [false, true].flatMap((dirty) =>
            [false, true].flatMap((credentialsPending) =>
                [false, true].map((targetDefinitionChanged) => ({
                    activity,
                    editingTargetName,
                    dirty,
                    credentialsPending,
                    targetDefinitionChanged,
                })),
            ),
        ),
    ),
);

describe("executionBlockedReason", () => {
    it.each<[string, Partial<DraftSnapshot>, string | undefined]>([
        ["an idle, saved target", {}, undefined],
        ["a save in flight", { activity: "savingTarget", credentialsPending: true }, SAVING],
        ["a target switch", { activity: "switchingTarget" }, LOADING_TARGET],
        ["a saved target reloading", { activity: "reloadingTarget" }, LOADING_TARGET],
        [
            "a credential lookup",
            { credentialsPending: true, targetDefinitionChanged: true },
            LOADING_CREDENTIALS,
        ],
        ["unsaved target changes", { targetDefinitionChanged: true }, SAVE_FIRST],
        [
            "ad-hoc values that differ",
            { editingTargetName: "", targetDefinitionChanged: true },
            undefined,
        ],
    ])("blocks Deploy for %s", (_, overrides, reason) => {
        expect(executionBlockedReason(draft(overrides))).toBe(reason);
    });
});

describe("saveBlockedReason", () => {
    it.each<[string, Partial<DraftSnapshot>, string | undefined]>([
        ["an idle, edited target", {}, undefined],
        ["an ad-hoc form", { editingTargetName: "", activity: "savingTarget" }, NO_TARGET],
        ["an unedited target", { dirty: false, activity: "savingTarget" }, NO_CHANGES],
        ["a save in flight", { activity: "savingTarget", credentialsPending: true }, SAVING],
        ["a target switch", { activity: "switchingTarget" }, LOADING_TARGET],
        ["a saved target reloading", { activity: "reloadingTarget" }, LOADING_TARGET],
        ["a credential lookup", { credentialsPending: true }, LOADING_CREDENTIALS],
        ["unsaved target changes", { targetDefinitionChanged: true }, undefined],
    ])("blocks Save for %s", (_, overrides, reason) => {
        expect(saveBlockedReason(draft(overrides))).toBe(reason);
    });
});

describe("draftControls", () => {
    it.each(everyDraft)(
        "disables Save exactly when it shows a reason ($activity, target '$editingTargetName', dirty $dirty, credentials pending $credentialsPending, definition changed $targetDefinitionChanged)",
        (snapshot) => {
            const reason = saveBlockedReason(snapshot);
            expect(draftControls(snapshot)).toMatchObject({
                saveDisabled: reason !== undefined,
                saveTitle: reason ?? "Save target",
            });
        },
    );

    it.each<[DraftActivity, boolean, string]>([
        ["idle", false, "Save target"],
        ["switchingTarget", true, LOADING_TARGET],
        ["reloadingTarget", true, LOADING_TARGET],
        ["savingTarget", true, SAVING],
    ])("locks every target action while %s", (activity, locked, saveTitle) => {
        expect(draftControls(draft({ activity }))).toEqual({
            saveDisabled: locked,
            saveTitle,
            selectDisabled: locked,
            newDisabled: locked,
            deleteDisabled: locked,
            inputsDisabled: locked,
        });
    });

    it.each<[string, Partial<DraftSnapshot>, Partial<DraftControls>]>([
        [
            "a credential lookup blocks New but not the select, Delete or the inputs",
            { credentialsPending: true },
            {
                newDisabled: true,
                selectDisabled: false,
                deleteDisabled: false,
                inputsDisabled: false,
            },
        ],
        [
            "an ad-hoc form has nothing to delete but can create",
            { editingTargetName: "" },
            { deleteDisabled: true, newDisabled: false },
        ],
    ])("%s", (_, overrides, controls) => {
        expect(draftControls(draft(overrides))).toMatchObject(controls);
    });
});
