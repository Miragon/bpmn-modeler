import { describe, expect, it } from "vitest";

import type { MergeSideCaption } from "@miragon/bpmn-modeler-types";

import {
    buildBlockedText,
    MERGE_MARKER_LABELS,
    MERGE_MENU_TEXTS,
    MERGE_STEP_TEXTS,
    markerCountTip,
    mergeCaptionParts,
    mergeCaptionText,
    openConflictsText,
    openShapelessConflictsText,
    reviewNotesText,
} from "./mergeBarTexts";
import type { MergeTranslate } from "./mergeTranslate";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

describe("mergeCaptionText", () => {
    it.each<[string, MergeSideCaption, string]>([
        [
            "names the user's branch and its commit",
            { side: "current", role: "branch", ref: "main", shortHash: "1111111", subject: "s" },
            "Current: your branch main · 1111111",
        ],
        [
            "names the merged branch",
            { side: "incoming", role: "upstream", ref: "feature", shortHash: "9f8e7d6" },
            "Incoming: other branch feature · 9f8e7d6",
        ],
        [
            "names the user's own commit during a rebase",
            { side: "incoming", role: "yourCommit", shortHash: "9f8e7d6" },
            "Incoming: your commit · 9f8e7d6",
        ],
        ["names a stash", { side: "incoming", role: "stash" }, "Incoming: your stash"],
        [
            "keeps a label Git wrote when the role is unknown",
            { side: "current", role: "unknown", ref: "ours" },
            "Current: ours",
        ],
        [
            "names only the side when nothing else is known",
            { side: "current", role: "unknown" },
            "Current",
        ],
    ])("%s", (_case, caption, expected) => {
        expect(mergeCaptionText(caption, untranslated)).toBe(expected);
    });

    it("translates the side and the role, not the branch name", () => {
        const german: Record<string, string> = {
            "Current": "Aktuell",
            "your branch": "dein Branch",
        };

        const text = mergeCaptionText(
            { side: "current", role: "branch", ref: "main" },
            (key) => german[key] ?? key,
        );

        expect(text).toBe("Aktuell: dein Branch main");
    });
});

describe("mergeCaptionParts", () => {
    it.each<[string, MergeSideCaption, { side: string; detail?: string }]>([
        [
            "splits the side from the branch and commit, which a narrow bar drops first",
            { side: "current", role: "branch", ref: "main", shortHash: "1111111" },
            { side: "Current", detail: "your branch main · 1111111" },
        ],
        [
            "has no detail when only the side is known",
            { side: "incoming", role: "unknown" },
            { side: "Incoming" },
        ],
    ])("%s", (_case, caption, expected) => {
        expect(mergeCaptionParts(caption, untranslated)).toStrictEqual(expected);
    });
});

describe("markerCountTip", () => {
    it.each<[Parameters<typeof markerCountTip>[0], string]>([
        [
            "takenFromThisSide",
            "Taken from this side: 2. Elements of this version the result keeps as they are here. Elements only the other version has are counted on the other pane only.",
        ],
        [
            "takenFromOtherSide",
            "Taken from the other side: 2. Elements of this version the result takes from the other version, or leaves out as the other version removed them. Elements only the other version has are counted on the other pane only.",
        ],
        [
            "conflict",
            "Conflict: 2. Open conflicts on elements this version has. Elements only the other version has are counted on the other pane only.",
        ],
    ])("says what %s counts and why the other pane counts differently", (marker, expected) => {
        expect(markerCountTip(marker, 2, untranslated)).toBe(expected);
    });
});

describe("menu words", () => {
    it("names the menu and why a step opened it", () => {
        expect(MERGE_MENU_TEXTS.more).toBe("More actions");
        expect(MERGE_MENU_TEXTS.steppedHere).toBe("This step has no shape, so it is listed here.");
    });

    it.each([
        [1, "1 open conflict not visible in the diagram"],
        [2, "2 open conflicts not visible in the diagram"],
    ])("names the %i open conflicts the menu counts", (count, expected) => {
        expect(openShapelessConflictsText(count, untranslated)).toBe(expected);
    });
});

describe("openConflictsText", () => {
    it.each<[number, string]>([
        [0, "No open conflicts"],
        [1, "1 open conflict"],
        [3, "3 open conflicts"],
    ])("counts %i", (count, expected) => {
        expect(openConflictsText(count, untranslated)).toBe(expected);
    });
});

describe("the bar's and the menu's labels", () => {
    it("names every marker and every step list control", () => {
        expect(Object.values(MERGE_MARKER_LABELS).every((label) => label.length > 0)).toBe(true);
        expect(Object.values(MERGE_STEP_TEXTS).every((label) => label.length > 0)).toBe(true);
    });
});

describe("build words", () => {
    it.each([
        [1, "1 conflict left"],
        [3, "3 conflicts left"],
    ])("says why Build is disabled with %i open", (count, text) => {
        expect(buildBlockedText(count, untranslated)).toBe(text);
    });

    it("counts the notes to review", () => {
        expect(reviewNotesText(2, untranslated)).toBe("Review notes (2)");
    });
});
