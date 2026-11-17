import { describe, expect, it } from "vitest";

import type { MergeSideCaption } from "@miragon/bpmn-modeler-types";

import {
    buildBlockedText,
    decisionButtonText,
    MERGE_MARKER_LABELS,
    MERGE_MENU_TEXTS,
    MERGE_STEP_TEXTS,
    markerCountTip,
    mergeCaptionParts,
    mergeCaptionText,
    openConflictsText,
    openShapelessConflictsText,
    reviewNotesText,
    shapelessEntryText,
    shapelessHeadingText,
} from "./mergeBarTexts";
import type { MergePadDecision } from "./mergePadDecisions";
import type { MergeTranslate } from "./mergeTexts";

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
    it("names the menu, its heading and why a step opened it", () => {
        expect(MERGE_MENU_TEXTS.more).toBe("More actions");
        expect(shapelessHeadingText(3, untranslated)).toBe("Not visible in the diagram (3)");
        expect(MERGE_MENU_TEXTS.steppedHere).toBe("This step has no shape, so it is listed here.");
    });

    it.each([
        [1, "1 open conflict not visible in the diagram"],
        [2, "2 open conflicts not visible in the diagram"],
    ])("names the %i open conflicts the menu counts", (count, expected) => {
        expect(openShapelessConflictsText(count, untranslated)).toBe(expected);
    });

    it.each<[MergePadDecision, string]>([
        [{ kind: "keep", scope: "element", side: "current" }, "Keep current"],
        [
            { kind: "keep", scope: "withContents", side: "incoming" },
            "Keep incoming with everything inside",
        ],
        [{ kind: "leaveOut", side: "current", otherSideLacks: "removed" }, "Leave out"],
        [
            {
                kind: "keepRemovedFlows",
                side: "incoming",
                offer: { elementId: "a", connections: ["f"], removedBy: "current" },
            },
            "Also keep its removed flows",
        ],
        [{ kind: "undo", scope: "element" }, "Undo pick"],
    ])("words a row's button for %o", (decision, expected) => {
        expect(decisionButtonText(decision, untranslated)).toBe(expected);
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
            "names a type of two words with the shared dictionary's spelling",
            { id: "DataStore_1", type: "bpmn:DataStore" },
            "DataStore_1 (Data store)",
        ],
        [
            "keeps the identifier of a type it has no name for",
            { id: "Bogus_1", type: "bpmn:Bogus" },
            "Bogus_1 (bpmn:Bogus)",
        ],
    ])("%s", (_case, entry, expected) => {
        expect(shapelessEntryText(entry, untranslated)).toBe(expected);
    });

    it("names an element by the name the host gives it", () => {
        expect(
            shapelessEntryText(
                { id: "Message_1", type: "bpmn:Message", name: "Order received" },
                untranslated,
            ),
        ).toBe("Order received (Message)");
    });

    // Every root element type, and the data object, which no canvas draws.
    it.each([
        "bpmn:Process",
        "bpmn:Collaboration",
        "bpmn:Message",
        "bpmn:Error",
        "bpmn:Escalation",
        "bpmn:Signal",
        "bpmn:DataStore",
        "bpmn:DataObject",
        "bpmn:ItemDefinition",
        "bpmn:Category",
        "bpmn:Interface",
        "bpmn:EndPoint",
        "bpmn:PartnerEntity",
        "bpmn:PartnerRole",
        "bpmn:Resource",
        "bpmn:CorrelationProperty",
        "bpmn:GlobalTask",
    ])("names %s in words a translation can look up", (type) => {
        const text = shapelessEntryText({ id: "Element_1", type }, (key) => `de:${key}`);

        expect(text).toMatch(/^Element_1 \(de:[A-Z][a-z]+( [a-z]+)*\)$/);
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
