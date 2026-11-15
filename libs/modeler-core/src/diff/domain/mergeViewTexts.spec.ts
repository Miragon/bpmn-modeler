import { describe, expect, it } from "vitest";

import {
    conflictMarkerNotice,
    MergeViewRefusal,
    mergeViewEndedText,
    mergeViewFailedText,
    mergeViewRefusal,
} from "./mergeViewTexts";

describe("mergeViewRefusal", () => {
    it.each<[MergeViewRefusal, string]>([
        [
            { kind: "notBpmn" },
            "notes.txt is not a BPMN file. The BPMN merge view opens conflicted .bpmn files only.",
        ],
        [
            { kind: "gitUnavailable" },
            "The BPMN merge view cannot read the versions of notes.txt from Git. Check that the Git extension is enabled and the file is in a repository.",
        ],
        [{ kind: "notConflicted" }, "notes.txt has no merge conflict to resolve."],
        [
            { kind: "oneSideDeleted", remainingSide: "current" },
            "notes.txt was deleted on the incoming side and changed on the current side. Keep or delete it in Source Control.",
        ],
        [
            { kind: "oneSideDeleted", remainingSide: "incoming" },
            "notes.txt was deleted on the current side and changed on the incoming side. Keep or delete it in Source Control.",
        ],
        [
            { kind: "noFile" },
            "Open a conflicted BPMN file, or select one in Source Control, to resolve it in the BPMN merge view.",
        ],
    ])("explains %j", (refusal, expected) => {
        expect(mergeViewRefusal(refusal, "notes.txt")).toBe(expected);
    });
});

describe("conflictMarkerNotice", () => {
    it("offers the merge view for a file the modeler cannot open", () => {
        expect(conflictMarkerNotice("order.bpmn")).toStrictEqual({
            id: "conflictMarkers",
            tone: "warning",
            message:
                "order.bpmn holds Git conflict markers, so the modeler cannot show it. Resolve the conflict in the BPMN merge view.",
            actions: [{ label: "Resolve in BPMN Merge View", value: "openMergeView" }],
        });
    });
});

describe("mergeViewEndedText", () => {
    it("tells how to open the merge view again", () => {
        expect(mergeViewEndedText()).toBe(
            "This merge view has ended. Open it again from Source Control.",
        );
    });
});

describe("mergeViewFailedText", () => {
    it("names the host's reason", () => {
        expect(mergeViewFailedText(new Error("no editor"))).toBe(
            "Failed to open the BPMN merge view: no editor",
        );
    });
});
