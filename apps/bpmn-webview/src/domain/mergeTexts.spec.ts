import { describe, expect, it } from "vitest";

import type { MergePaneBadge, MergePaneBuildNote } from "@miragon/bpmn-modeler-shared";
import type { MergeSide } from "@miragon/bpmn-modeler-types";

import type { MergePadDecision } from "./mergePadDecisions";

import {
    buildNoteText,
    compareWithText,
    comparisonPaneText,
    comparisonText,
    keepSideText,
    MERGE_BUILD_TEXTS,
    mergeSideText,
    MergeTranslate,
    padDecisionText,
    pickBadgeText,
    restoreOfferText,
} from "./mergeTexts";

const untranslated: MergeTranslate = (key, replacements = {}) =>
    key.replace(/\{(\w+)\}/g, (_match, name: string) => replacements[name] ?? `{${name}}`);

describe("pickBadgeText", () => {
    it.each<[string, MergePaneBadge, { side: string; label: string }]>([
        [
            "names the side an element was kept from on the pane that kept it",
            { id: "Task_1", kind: "keptHere", keptSide: "incoming", scope: "element" },
            { side: "Incoming", label: "Kept from incoming, your pick" },
        ],
        [
            "names the kept side on the pane whose version was replaced",
            { id: "Task_1", kind: "replacedHere", keptSide: "current", scope: "element" },
            { side: "Current", label: "Kept from current, your pick" },
        ],
        [
            "says a container was kept with everything inside",
            { id: "Sub_1", kind: "keptHere", keptSide: "current", scope: "withContents" },
            { side: "Current", label: "Kept from current with everything inside, your pick" },
        ],
        [
            "says an element was kept with its flows",
            { id: "Task_1", kind: "keptHere", keptSide: "incoming", scope: "withConnections" },
            { side: "Incoming", label: "Kept from incoming with its flows, your pick" },
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
            { kind: "leaveOut", side: "current", otherSideLacks: "removed" },
            {
                label: "Leave out: Leave it out, as current removed it",
                tooltip: "Leave out: Leave it out, as current removed it",
            },
        ],
        [
            { kind: "leaveOut", side: "incoming", otherSideLacks: "missing" },
            {
                label: "Leave out: Leave it out, as incoming doesn't have it",
                tooltip: "Leave out: Leave it out, as incoming doesn't have it",
            },
        ],
        [
            { kind: "keepRemovedFlows", side: "incoming", offer: offer(["Flow_1", "Flow_2"]) },
            {
                label: "Also keep its removed flows",
                tooltip:
                    "Also keep its removed flows: Also keep the 2 flows current removed with it",
            },
        ],
        [
            { kind: "keepRemovedFlows", side: "incoming", offer: offer(["Flow_1"]) },
            {
                label: "Also keep its removed flows",
                tooltip: "Also keep its removed flows: Also keep the flow current removed with it",
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
        { kind: "leaveOut", side: "current", otherSideLacks: "removed" },
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
            {
                kind: "restoredWithoutConnections",
                id: "Task_Pack",
                connections: ["Flow_2"],
                boundaryEvents: ["Timer_1"],
            },
            "Pack box is kept without the 2 elements the other side removed with it: Timer_1, to packing",
        ],
        [
            {
                kind: "restoredWithoutConnections",
                id: "Task_Pack",
                connections: [],
                boundaryEvents: ["Timer_1"],
            },
            "Pack box is kept without the boundary event the other side removed with it: Timer_1",
        ],
        [
            {
                kind: "defaultFlowNotRestored",
                id: "Task_Pack",
                flow: "Flow_2",
                keptDefault: "Flow_3",
            },
            "to packing is kept, but Pack box keeps Flow_3 as its default flow",
        ],
        [
            { kind: "defaultFlowNotRestored", id: "Task_Pack", flow: "Flow_2" },
            "to packing is kept but is no longer the default flow of Pack box",
        ],
        [
            { kind: "layoutChangedByBoth", ids: ["Task_Pack", "Flow_2"], keptSide: "current" },
            "Both sides changed the layout of Pack box, to packing; current's is kept",
        ],
        [
            { kind: "layoutChangedByBoth", ids: ["Task_Pack"], keptSide: "incoming" },
            "Both sides changed the layout of Pack box; incoming's is kept",
        ],
        [
            { kind: "frameDiffers", attribute: "exporterVersion" },
            "The file's exporterVersion differs between the sides; current's is kept",
        ],
        [
            { kind: "frameDiffers", attribute: "extensionElements" },
            "The file's extensionElements differs between the sides; current's is kept",
        ],
    ])("words a %o note with the canvas's names", (note, text) => {
        expect(buildNoteText(note, nameOf, untranslated)).toBe(text);
    });
});
