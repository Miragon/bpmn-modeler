import { describe, expect, it } from "vitest";

import {
    buildDoneNotice,
    buildFailureText,
    buildRefusalText,
    compareFailureText,
    overwriteConfirm,
    type OverwriteReason,
    readFailureText,
    writeFailureText,
} from "./mergeBuildTexts";

const RESTORE_HINT =
    'Until you stage order.bpmn, "git checkout -m -- order.bpmn" brings back Git\'s conflict markers.';

describe("overwriteConfirm", () => {
    it.each<[OverwriteReason, string, string]>([
        [
            "unsavedChanges",
            "order.bpmn has unsaved changes. Build over them?",
            "Building replaces the whole file with the merge result and saves it, so the unsaved changes are lost.",
        ],
        [
            "resolvedElsewhere",
            "order.bpmn holds no conflict markers. Build over it?",
            "It was resolved another way, or another merge tool changed it. Building replaces it with the merge result.",
        ],
        [
            "editedSinceOpened",
            "order.bpmn changed since the merge view opened. Build over it?",
            "Building replaces those changes, also any conflict you resolved by hand, with the merge result.",
        ],
        [
            "editedSinceBuild",
            "order.bpmn changed since the last build. Build over it?",
            "Building replaces those changes with a new merge result.",
        ],
    ])("asks before a build over %s", (reason, title, detail) => {
        expect(overwriteConfirm(reason, "order.bpmn")).toStrictEqual({
            id: `mergeBuild.${reason}`,
            title,
            confirmLabel: "Build",
            details: [detail, RESTORE_HINT],
        });
    });
});

describe("buildRefusalText", () => {
    it.each([
        [1, "Decide the open conflict of order.bpmn before you build it."],
        [3, "Decide the 3 open conflicts of order.bpmn before you build it."],
    ])("names the %i conflicts left", (openConflicts, text) => {
        expect(buildRefusalText("order.bpmn", openConflicts)).toBe(text);
    });
});

describe("buildFailureText", () => {
    it("says the file stayed as it was and passes the merge's reason with its ids", () => {
        expect(
            buildFailureText(
                "order.bpmn",
                new Error("The merged BPMN lacks the shape of Task_Check"),
            ),
        ).toBe(
            "Cannot build order.bpmn, so it stays as it was: The merged BPMN lacks the shape of Task_Check",
        );
    });
});

describe("writeFailureText", () => {
    it("names the file the host did not write", () => {
        expect(writeFailureText("order.bpmn", new Error("VS Code did not save it"))).toBe(
            "Cannot write the merge result to order.bpmn: VS Code did not save it",
        );
    });
});

describe("readFailureText", () => {
    it("says nothing was built when the working file cannot be read", () => {
        expect(readFailureText("order.bpmn", new Error("EACCES"))).toBe(
            "Cannot read order.bpmn, so nothing was built: EACCES",
        );
    });
});

describe("compareFailureText", () => {
    it("names the file whose result cannot be compared", () => {
        expect(compareFailureText("order.bpmn", new Error("no editor"))).toBe(
            "Cannot compare the merge result of order.bpmn: no editor",
        );
    });
});

describe("buildDoneNotice", () => {
    it.each([
        [
            0,
            "Built order.bpmn from your decisions. Review it, then stage it to mark the conflict resolved.",
        ],
        [
            1,
            "Built order.bpmn from your decisions. Review it and the 1 note in the merge view, then stage it to mark the conflict resolved.",
        ],
        [
            4,
            "Built order.bpmn from your decisions. Review it and the 4 notes in the merge view, then stage it to mark the conflict resolved.",
        ],
    ])("tells what to do next after a build with %i notes", (noteCount, text) => {
        expect(buildDoneNotice("order.bpmn", noteCount)).toBe(text);
    });
});
