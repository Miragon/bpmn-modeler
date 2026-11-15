import { describe, expect, it } from "vitest";

import { overwriteConfirm, type OverwriteReason } from "./mergeBuildTexts";
import { overwriteDecision } from "./overwriteDecision";

const MARKED = [
    "<definitions>",
    "<<<<<<< HEAD",
    '  <task id="Task_Check" name="Check main order" />',
    "=======",
    '  <task id="Task_Check" name="Check feature order" />',
    ">>>>>>> feature",
    "</definitions>",
].join("\n");

const BUILT = '<definitions><task id="Task_Check" name="Check feature order" /></definitions>';

const EDITED = '<definitions><task id="Task_Check" name="Check edited order" /></definitions>';

describe("overwriteDecision", () => {
    it.each<[string, { text: string; isDirty: boolean }, string | undefined]>([
        ["Git's conflict markers before any build", { text: MARKED, isDirty: false }, undefined],
        ["conflict markers again after a build", { text: MARKED, isDirty: false }, BUILT],
        ["the last build, saved and untouched", { text: BUILT, isDirty: false }, BUILT],
    ])("writes over %s", (_case, workingFile, lastBuiltXml) => {
        expect(overwriteDecision(workingFile, lastBuiltXml, "order.bpmn")).toStrictEqual({
            kind: "write",
        });
    });

    it.each<[string, { text: string; isDirty: boolean }, string | undefined, OverwriteReason]>([
        [
            "a file resolved without markers and never built",
            { text: EDITED, isDirty: false },
            undefined,
            "resolvedElsewhere",
        ],
        [
            "a build the user edited and saved",
            { text: EDITED, isDirty: false },
            BUILT,
            "editedSinceBuild",
        ],
        [
            "unsaved changes over Git's markers",
            { text: MARKED, isDirty: true },
            undefined,
            "unsavedChanges",
        ],
        [
            "unsaved changes over the last build",
            { text: BUILT, isDirty: true },
            BUILT,
            "unsavedChanges",
        ],
        [
            "unsaved changes of a file resolved elsewhere",
            { text: EDITED, isDirty: true },
            undefined,
            "unsavedChanges",
        ],
    ])("asks before it writes over %s", (_case, workingFile, lastBuiltXml, reason) => {
        expect(overwriteDecision(workingFile, lastBuiltXml, "order.bpmn")).toStrictEqual({
            kind: "confirm",
            request: overwriteConfirm(reason, "order.bpmn"),
        });
    });
});
