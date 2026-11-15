import { describe, expect, it } from "vitest";

import type {
    MergePaneBadge,
    MergePaneBlock,
    MergePaneBuildNote,
    MergePaneOutcome,
} from "@miragon/bpmn-modeler-shared";
import type { MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types";

import {
    blockText,
    buildBlockedText,
    buildNoteText,
    compareWithText,
    comparisonText,
    keepSideText,
    MERGE_BUILD_TEXTS,
    MERGE_LEGEND_TEXTS,
    MERGE_MARKER_LABELS,
    MergeTranslate,
    mergeCaptionText,
    openConflictsText,
    outcomeHeadline,
    pickBadgeText,
    pickNotDrawnText,
    restoreOfferText,
    reviewNotesText,
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

describe("merge legend words", () => {
    it("names every marker and every legend control", () => {
        expect(Object.values(MERGE_MARKER_LABELS).every((label) => label.length > 0)).toBe(true);
        expect(Object.values(MERGE_LEGEND_TEXTS).every((label) => label.length > 0)).toBe(true);
    });
});

describe("pickBadgeText", () => {
    it.each<[string, MergePaneBadge, { letter: string; label: string }]>([
        [
            "names the side an element was kept from on the pane that kept it",
            { id: "Task_1", kind: "keptHere", keptSide: "incoming", scope: "element" },
            { letter: "I", label: "Kept from incoming, your pick" },
        ],
        [
            "names the kept side on the pane whose version was replaced",
            { id: "Task_1", kind: "replacedHere", keptSide: "current", scope: "element" },
            { letter: "C", label: "Kept from current, your pick" },
        ],
        [
            "says a container was kept with everything inside",
            { id: "Sub_1", kind: "keptHere", keptSide: "current", scope: "withContents" },
            { letter: "C", label: "Kept from current with everything inside, your pick" },
        ],
        [
            "says an element was kept with its flows",
            { id: "Task_1", kind: "keptHere", keptSide: "incoming", scope: "withConnections" },
            { letter: "I", label: "Kept from incoming with its flows, your pick" },
        ],
    ])("%s", (_name, badge, expected) => {
        expect(pickBadgeText(badge, untranslated)).toStrictEqual(expected);
    });
});

describe("pickNotDrawnText", () => {
    it("names the kept side and the element", () => {
        expect(pickNotDrawnText("incoming", "Reject order", untranslated)).toBe(
            "Kept from incoming: Reject order",
        );
    });
});

describe("keepSideText", () => {
    it.each<[MergeSide, string]>([
        ["current", "Keep current"],
        ["incoming", "Keep incoming"],
    ])("names the %s side's keep action", (side, text) => {
        expect(keepSideText(side, untranslated)).toBe(text);
    });
});

describe("blockText", () => {
    const nameOf = (id: string) => ({ Flow_2: "Ready to pack", Task_Pack: "Pack" })[id] ?? id;

    const ends = { elementId: "Flow_2", targetId: "Task_Pack" } as const;

    it.each<[string, MergePaneBlock, string]>([
        [
            "dependentPicked",
            { ...ends, obstacle: "dependentPicked" },
            "Ready to pack, which you picked, needs Pack",
        ],
        [
            "targetDroppedByThisPick",
            { ...ends, obstacle: "targetDroppedByThisPick" },
            "Ready to pack needs Pack, which this pick drops",
        ],
        [
            "idHeldByAnother",
            { ...ends, obstacle: "idHeldByAnother" },
            "Ready to pack and Pack hold the same id",
        ],
        [
            "sideLacksTarget missing the target",
            { ...ends, obstacle: "sideLacksTarget", missing: "target" },
            "Ready to pack needs Pack, which this side does not have",
        ],
        [
            "sideLacksTarget missing a part",
            { ...ends, obstacle: "sideLacksTarget", missing: "part" },
            "Ready to pack needs a part of Pack that this side does not have",
        ],
        [
            "targetPickedWithout missing the target",
            { ...ends, obstacle: "targetPickedWithout", missing: "target" },
            "Ready to pack needs Pack, which you picked from a side without it",
        ],
        [
            "targetPickedWithout missing a part",
            { ...ends, obstacle: "targetPickedWithout", missing: "part" },
            "Ready to pack needs a part of Pack, which you picked from a side without it",
        ],
    ])("words a %s reason with the elements' names", (_case, block, text) => {
        expect(blockText(block, nameOf, untranslated)).toBe(text);
    });
});

describe("restoreOfferText", () => {
    it.each<[number, string]>([
        [1, "Also keep the flow current removed with it"],
        [2, "Also keep the 2 flows current removed with it"],
    ])("offers %s flows", (count, text) => {
        expect(
            restoreOfferText(
                {
                    elementId: "Task_Pack",
                    connections: Array.from({ length: count }, (_, index) => `Flow_${index}`),
                    removedBy: "current",
                },
                untranslated,
            ),
        ).toBe(text);
    });
});

describe("outcomeHeadline", () => {
    it.each<[string, MergePaneOutcome, string]>([
        [
            "names the element a pick kept",
            {
                applied: true,
                action: "pick",
                elementId: "Task_Pack",
                pulledIn: [],
                dropped: [],
                reopened: [],
            },
            "Kept Pack",
        ],
        [
            "names the element whose pick was taken back",
            {
                applied: true,
                action: "unpick",
                elementId: "Task_Pack",
                pulledIn: [],
                dropped: [],
                reopened: [],
            },
            "Took back the pick of Pack",
        ],
        [
            "names the element a pick left out",
            {
                applied: true,
                action: "leaveOut",
                elementId: "Task_Pack",
                pulledIn: [],
                dropped: [],
                reopened: [],
            },
            "Left out Pack",
        ],
        [
            "names the element a pick could not leave out",
            { applied: false, action: "leaveOut", elementId: "Task_Pack", blockedBy: [] },
            "Cannot leave out Pack",
        ],
        [
            "names the element a pick could not keep",
            { applied: false, action: "pick", elementId: "Task_Pack", blockedBy: [] },
            "Cannot keep Pack",
        ],
        [
            "names the element whose pick could not be taken back",
            { applied: false, action: "unpick", elementId: "Task_Pack", blockedBy: [] },
            "Cannot take back the pick of Pack",
        ],
    ])("%s", (_name, outcome, text) => {
        expect(outcomeHeadline(outcome, () => "Pack", untranslated)).toBe(text);
    });
});

describe("build words", () => {
    it("names the build actions", () => {
        expect(MERGE_BUILD_TEXTS).toStrictEqual({ build: "Build", notes: "Notes of the build" });
    });

    it.each([
        [1, "1 conflict left"],
        [3, "3 conflicts left"],
    ])("says why Build is disabled with %i open", (count, text) => {
        expect(buildBlockedText(count, untranslated)).toBe(text);
    });

    it.each<[MergeSide, string, string]>([
        ["current", "Compare with current", "Result against current"],
        ["incoming", "Compare with incoming", "Result against incoming"],
    ])("names the comparison with %s", (side, action, comparison) => {
        expect(compareWithText(side, untranslated)).toBe(action);
        expect(comparisonText(side, untranslated)).toBe(comparison);
    });

    it("counts the notes to review", () => {
        expect(reviewNotesText(2, untranslated)).toBe("Review notes (2)");
    });
});

describe("buildNoteText", () => {
    const nameOf = (id: string) => ({ Flow_2: "to packing", Task_Pack: "Pack box" })[id] ?? id;

    it.each<[MergePaneBuildNote, string]>([
        [
            { kind: "flowEndsFromDifferentSides", id: "Flow_2", ends: ["Task_Check", "Task_Pack"] },
            "to packing connects shapes drawn by different sides; check where it meets Task_Check, Pack box",
        ],
        [
            { kind: "addedAtSamePlace", ids: ["Task_A", "Task_B"] },
            "Task_A and Task_B were added at the same place",
        ],
        [
            { kind: "drawnApartFromContainer", id: "Task_Pack", containers: ["Lane_1"] },
            "Pack box is drawn by another side than Lane_1; check that it still sits inside",
        ],
        [
            {
                kind: "restoredWithoutConnections",
                id: "Task_Pack",
                connections: ["Flow_2", "Flow_3"],
            },
            "Pack box is kept without the flows the other side removed with it: to packing, Flow_3",
        ],
        [
            { kind: "frameDiffers", attribute: "exporterVersion" },
            "Both sides changed the file's exporterVersion; current's is kept",
        ],
    ])("words a %o note with the canvas's names", (note, text) => {
        expect(buildNoteText(note, nameOf, untranslated)).toBe(text);
    });
});
