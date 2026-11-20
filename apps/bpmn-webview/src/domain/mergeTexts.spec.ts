import { describe, expect, it } from "vitest";

import type { MergePanePick } from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergePadDecision } from "./mergePadDecisions";

import {
    compareWithText,
    comparisonPaneText,
    comparisonText,
    keepSideText,
    MERGE_BUILD_TEXTS,
    mergeSideText,
    padDecisionText,
    pickBadgeText,
    restoreOfferText,
} from "./mergeTexts";
import type { MergeTranslate } from "./mergeTranslate";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

describe("pickBadgeText", () => {
    it.each<[string, MergePanePick, { side: string; label: string }]>([
        [
            "names the side an element was kept from on the pane that kept it",
            { keptSide: "incoming", scope: "element" },
            { side: "Incoming", label: "Kept from incoming, your pick" },
        ],
        [
            "names the kept side on the pane whose version was replaced",
            { keptSide: "current", scope: "element" },
            { side: "Current", label: "Kept from current, your pick" },
        ],
        [
            "says a container was kept with everything inside",
            { keptSide: "current", scope: "withContents" },
            { side: "Current", label: "Kept from current with everything inside, your pick" },
        ],
        [
            "says an element was kept with what was removed with it",
            { keptSide: "incoming", scope: "withRemoved" },
            {
                side: "Incoming",
                label: "Kept from incoming with what was removed with it, your pick",
            },
        ],
    ])("%s", (_name, badge, expected) => {
        expect(pickBadgeText(badge, untranslated)).toStrictEqual(expected);
    });

    it("names the side with the word the pane's caption uses", () => {
        for (const side of ["current", "incoming"] as const) {
            expect(pickBadgeText({ keptSide: side, scope: "element" }, untranslated).side).toBe(
                mergeSideText(side, untranslated),
            );
        }
    });
});

describe("padDecisionText", () => {
    const offer = (connections: readonly string[]) =>
        ({ elementId: "Task_1", connections, removedBy: "current" }) as const;

    it.each<[MergePadDecision, { label: string; tooltip: string }]>([
        [
            { kind: "keep", scope: "element", side: "incoming" },
            { label: "Keep incoming", tooltip: "Keep incoming: Keep it as incoming has it" },
        ],
        [
            { kind: "keep", scope: "element", side: "current" },
            { label: "Keep current", tooltip: "Keep current: Keep it as current has it" },
        ],
        [
            { kind: "keep", scope: "withContents", side: "incoming", reach: "contents" },
            {
                label: "Keep incoming with everything inside",
                tooltip:
                    "Keep incoming with everything inside: Keep it and everything inside as incoming has them",
            },
        ],
        [
            { kind: "leaveOut", side: "current", lack: "removed" },
            {
                label: "Leave out: Leave it out, as current removed it",
                tooltip: "Leave out: Leave it out, as current removed it",
            },
        ],
        [
            { kind: "leaveOut", side: "incoming", lack: "missing" },
            {
                label: "Leave out: Leave it out, as incoming doesn't have it",
                tooltip: "Leave out: Leave it out, as incoming doesn't have it",
            },
        ],
        [
            { kind: "keepRemovedWith", side: "incoming", offer: offer(["Flow_1", "Flow_2"]) },
            {
                label: "Also keep what was removed with it",
                tooltip:
                    "Also keep what was removed with it: Also keep the 2 flows current removed with it",
            },
        ],
        [
            { kind: "keepRemovedWith", side: "incoming", offer: offer(["Flow_1"]) },
            {
                label: "Also keep what was removed with it",
                tooltip:
                    "Also keep what was removed with it: Also keep the flow current removed with it",
            },
        ],
        [
            { kind: "undo", scope: "element" },
            {
                label: "Undo pick",
                tooltip: "Undo pick: Go back to what the merge decided by itself",
            },
        ],
    ])("words %o", (decision, expected) => {
        expect(padDecisionText(decision, untranslated)).toStrictEqual(expected);
    });

    it("says that keeping everything inside a collaboration keeps every pool with its process, as the library reaches", () => {
        expect(
            padDecisionText(
                { kind: "keep", scope: "withContents", side: "current", reach: "poolProcesses" },
                untranslated,
            ),
        ).toStrictEqual({
            label: "Keep current with everything inside",
            tooltip:
                "Keep current with everything inside: Keep it and every pool with its process as current has them",
        });
    });

    it.each<Extract<MergePadDecision, { side: MergeSide }>>([
        { kind: "keep", scope: "element", side: "current" },
        { kind: "keep", scope: "withContents", side: "incoming", reach: "contents" },
        { kind: "leaveOut", side: "current", lack: "removed" },
    ])("names the side in the screen readers' label of %o", (decision) => {
        expect(padDecisionText(decision, untranslated).label.toLowerCase()).toContain(
            decision.side,
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

    it.each<[string, readonly string[], readonly string[], string]>([
        [
            "a boundary event alone",
            [],
            ["Timer_1"],
            "Also keep the boundary event incoming removed with it",
        ],
        [
            "flows and boundary events together",
            ["Flow_1", "Flow_2"],
            ["Timer_1"],
            "Also keep the 3 elements incoming removed with it",
        ],
        [
            "two boundary events",
            [],
            ["Timer_1", "Error_1"],
            "Also keep the 2 elements incoming removed with it",
        ],
        [
            "flows with an empty list of boundary events",
            ["Flow_1", "Flow_2"],
            [],
            "Also keep the 2 flows incoming removed with it",
        ],
    ])("counts elements for %s", (_name, connections, boundaryEvents, text) => {
        expect(
            restoreOfferText(
                { elementId: "Task_Pack", connections, boundaryEvents, removedBy: "incoming" },
                untranslated,
            ),
        ).toBe(text);
    });
});

describe("build words", () => {
    it("names the build actions", () => {
        expect(MERGE_BUILD_TEXTS).toStrictEqual({ build: "Build", notes: "Notes of the build" });
    });

    it.each<[MergeSide, string, string]>([
        ["current", "Compare with current", "Result against current"],
        ["incoming", "Compare with incoming", "Result against incoming"],
    ])("names the comparison with %s", (side, action, comparison) => {
        expect(compareWithText(side, untranslated)).toBe(action);
        expect(comparisonText(side, untranslated)).toBe(comparison);
    });

    it.each<["before" | "after", MergeSide, string]>([
        ["before", "incoming", "Incoming"],
        ["before", "current", "Current"],
        ["after", "incoming", "Result"],
    ])("labels the %s pane of a result compared with %s", (side, against, label) => {
        expect(comparisonPaneText(side, against, untranslated)).toBe(label);
    });
});

describe("the words of a merge by hand", () => {
    it.each<[MergePanePick, { side: string; label: string; byHand?: string }]>([
        [
            {
                keptSide: "current",
                scope: "element",
                mergedByHand: true,
            },
            {
                side: "Current",
                label: "Kept from current and merged by hand, your pick",
                byHand: "by hand",
            },
        ],
        [
            {
                keptSide: "incoming",
                scope: "withContents",
                mergedByHand: true,
            },
            {
                side: "Incoming",
                label: "Kept from incoming with everything inside and merged by hand, your pick",
                byHand: "by hand",
            },
        ],
    ])("adds the word and repeats the side on a badge merged by hand: %o", (badge, expected) => {
        expect(pickBadgeText(badge, untranslated)).toStrictEqual(expected);
    });

    it.each<[MergePadDecision, { label: string; tooltip: string }]>([
        [
            { kind: "mergeXml", mode: "open" },
            {
                label: "Merge XML",
                tooltip:
                    "Merge XML: Merge both sides' changes to its XML by hand in a merge editor",
            },
        ],
        [
            { kind: "mergeXml", mode: "edit" },
            {
                label: "Edit merged XML",
                tooltip: "Edit merged XML: Change the XML you merged by hand",
            },
        ],
    ])("words the pad's %o", (decision, expected) => {
        expect(padDecisionText(decision, untranslated)).toStrictEqual(expected);
    });
});
