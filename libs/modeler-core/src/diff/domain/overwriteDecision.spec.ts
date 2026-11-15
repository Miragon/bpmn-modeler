import { describe, expect, it } from "vitest";

import { overwriteConfirm, type OverwriteReason } from "./mergeBuildTexts";
import { overwriteDecision, type WorkingFileHistory } from "./overwriteDecision";

const MARKED = [
    "<definitions>",
    "<<<<<<< HEAD",
    '  <task id="Task_Check" name="Check main order" />',
    '  <task id="Task_Pack" name="Pack main box" />',
    "=======",
    '  <task id="Task_Check" name="Check feature order" />',
    '  <task id="Task_Pack" name="Pack feature box" />',
    ">>>>>>> feature",
    "</definitions>",
    "",
].join("\n");

const PARTLY_RESOLVED = MARKED.replace(
    '  <task id="Task_Check" name="Check main order" />\n',
    "",
).replace('  <task id="Task_Check" name="Check feature order" />\n', "");

const BUILT = [
    "<definitions>",
    '  <task id="Task_Check" name="Check feature order" />',
    "</definitions>",
    "",
].join("\n");

const EDITED = BUILT.replace("Check feature order", "Check edited order");

const crlf = (text: string) => text.replaceAll("\n", "\r\n");

describe("overwriteDecision", () => {
    it.each<[string, { text: string; isDirty: boolean }, WorkingFileHistory]>([
        [
            "Git's conflict markers before any build",
            { text: MARKED, isDirty: false },
            { opened: MARKED },
        ],
        [
            "conflict markers again after a build",
            { text: MARKED, isDirty: false },
            { opened: MARKED, lastBuilt: BUILT },
        ],
        [
            "Git's conflict markers in other line endings than when the merge view opened",
            { text: crlf(MARKED), isDirty: false },
            { opened: MARKED },
        ],
        [
            "the last build, saved and untouched",
            { text: BUILT, isDirty: false },
            { opened: MARKED, lastBuilt: BUILT },
        ],
        [
            "the last build, saved in the file's CRLF line endings",
            { text: crlf(BUILT), isDirty: false },
            { opened: crlf(MARKED), lastBuilt: BUILT },
        ],
    ])("writes over %s", (_case, workingFile, history) => {
        expect(overwriteDecision(workingFile, history, "order.bpmn")).toStrictEqual({
            kind: "write",
        });
    });

    it.each<[string, { text: string; isDirty: boolean }, WorkingFileHistory, OverwriteReason]>([
        [
            "a file resolved without markers and never built",
            { text: EDITED, isDirty: false },
            { opened: MARKED },
            "resolvedElsewhere",
        ],
        [
            "a build the user edited and saved",
            { text: EDITED, isDirty: false },
            { opened: MARKED, lastBuilt: BUILT },
            "editedSinceBuild",
        ],
        [
            "markers around a conflict the user resolved by hand since the merge view opened",
            { text: PARTLY_RESOLVED, isDirty: false },
            { opened: MARKED },
            "editedSinceOpened",
        ],
        [
            "markers the user edited after a build",
            { text: PARTLY_RESOLVED, isDirty: false },
            { opened: MARKED, lastBuilt: BUILT },
            "editedSinceOpened",
        ],
        [
            "markers when the file could not be read as the merge view opened",
            { text: MARKED, isDirty: false },
            {},
            "editedSinceOpened",
        ],
        [
            "unsaved changes over Git's markers",
            { text: MARKED, isDirty: true },
            { opened: MARKED },
            "unsavedChanges",
        ],
        [
            "unsaved changes over the last build",
            { text: BUILT, isDirty: true },
            { opened: MARKED, lastBuilt: BUILT },
            "unsavedChanges",
        ],
        [
            "unsaved changes of a file resolved elsewhere",
            { text: EDITED, isDirty: true },
            { opened: MARKED },
            "unsavedChanges",
        ],
    ])("asks before it writes over %s", (_case, workingFile, history, reason) => {
        expect(overwriteDecision(workingFile, history, "order.bpmn")).toStrictEqual({
            kind: "confirm",
            request: overwriteConfirm(reason, "order.bpmn"),
        });
    });
});
