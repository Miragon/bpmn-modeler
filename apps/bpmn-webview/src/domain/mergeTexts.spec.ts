import { describe, expect, it } from "vitest";

import type { MergeSideCaption } from "@miragon/bpmn-modeler-types";

import {
    MERGE_LEGEND_TEXTS,
    MERGE_MARKER_LABELS,
    MergeTranslate,
    mergeCaptionText,
    openConflictsText,
    shapelessEntryText,
} from "./mergeTexts";

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

describe("openConflictsText", () => {
    it.each<[number, string]>([
        [0, "No open conflicts"],
        [1, "1 open conflict"],
        [3, "3 open conflicts"],
    ])("counts %i", (count, expected) => {
        expect(openConflictsText(count, untranslated)).toBe(expected);
    });
});

describe("shapelessEntryText", () => {
    it.each<[string, { id: string; type: string }, string]>([
        [
            "names the process by its id and type",
            { id: "Process_1", type: "bpmn:Process" },
            "Process_1 (Process)",
        ],
        [
            "spells a type of two words apart",
            { id: "DataStore_1", type: "bpmn:DataStore" },
            "DataStore_1 (Data Store)",
        ],
    ])("%s", (_case, entry, expected) => {
        expect(shapelessEntryText(entry, untranslated)).toBe(expected);
    });
});

describe("merge legend words", () => {
    it("names every marker and every legend control", () => {
        expect(Object.values(MERGE_MARKER_LABELS).every((label) => label.length > 0)).toBe(true);
        expect(Object.values(MERGE_LEGEND_TEXTS).every((label) => label.length > 0)).toBe(true);
    });
});
