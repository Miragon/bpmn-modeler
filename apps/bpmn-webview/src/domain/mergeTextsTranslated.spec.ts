import { describe, expect, it } from "vitest";

import type {
    MergeObstacleKind,
    MergeObstacleWithMissing,
    MergePaneAction,
    MergePaneBlock,
    MergePaneBuildNote,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";
import { MERGE_CAPTION_ROLES, MERGE_SIDES, type MergeSide } from "@miragon/bpmn-modeler-types";

import {
    blockText,
    buildBlockedText,
    buildNoteText,
    compareWithText,
    comparisonPaneText,
    comparisonText,
    keepSideText,
    MERGE_BUILD_TEXTS,
    MERGE_LEGEND_TEXTS,
    MERGE_MARKER_LABELS,
    MERGE_PICK_TEXTS,
    mergeCaptionText,
    openConflictsText,
    outcomeHeadline,
    pickBadgeText,
    pickNotDrawnText,
    restoreOfferText,
    reviewNotesText,
} from "./mergeTexts";

// Records, so the compiler names a kind the merge adds and this spec misses.
const PICK_SCOPES: Record<MergePickScope, true> = {
    element: true,
    withContents: true,
    withConnections: true,
};
const OBSTACLES: Record<MergeObstacleKind, true> = {
    targetInNoVersion: true,
    targetPickedWithout: true,
    targetDroppedByThisPick: true,
    targetTakenByThisPickWithoutPart: true,
    sideLacksTarget: true,
    targetNotInResult: true,
    targetTakenWithoutPart: true,
    dependentPicked: true,
    dependentPulledInByThisPick: true,
    idHeldByAnother: true,
    processInAnotherCollaboration: true,
};
const WITH_MISSING: Record<MergeObstacleWithMissing, true> = {
    targetPickedWithout: true,
    sideLacksTarget: true,
};
const ACTIONS: Record<MergePaneAction, true> = { pick: true, leaveOut: true, unpick: true };
const NOTES: Record<MergePaneBuildNote["kind"], MergePaneBuildNote> = {
    flowEndsFromDifferentSides: { kind: "flowEndsFromDifferentSides", id: "a", ends: ["b"] },
    addedAtSamePlace: { kind: "addedAtSamePlace", ids: ["a", "b"] },
    drawnApartFromContainer: { kind: "drawnApartFromContainer", id: "a", containers: ["b"] },
    restoredWithoutConnections: { kind: "restoredWithoutConnections", id: "a", connections: ["b"] },
    frameDiffers: { kind: "frameDiffers", attribute: "exporter" },
};

const keysOf = <Kind extends string>(record: Record<Kind, unknown>) =>
    Object.keys(record) as Kind[];

/** Every key the merge texts pass to translate, gathered by asking for each text once. */
function mergeTextKeys(): Set<string> {
    const keys = new Set<string>([
        ...Object.values(MERGE_MARKER_LABELS),
        ...Object.values(MERGE_LEGEND_TEXTS),
        ...Object.values(MERGE_PICK_TEXTS),
        ...Object.values(MERGE_BUILD_TEXTS),
    ]);
    const translate = (key: string) => {
        keys.add(key);
        return key;
    };
    const nameOf = (id: string) => id;
    for (const side of MERGE_SIDES) {
        for (const role of MERGE_CAPTION_ROLES) {
            mergeCaptionText({ side, role, ref: "main", shortHash: "1a2b3c4" }, translate);
        }
        for (const scope of keysOf(PICK_SCOPES))
            pickBadgeText({ keptSide: side, scope }, translate);
        pickNotDrawnText(side, "Task", translate);
        keepSideText(side, translate);
        compareWithText(side, translate);
        comparisonText(side, translate);
        comparisonPaneText("before", side, translate);
        comparisonPaneText("after", side, translate);
        for (const connections of [["f1"], ["f1", "f2"]]) {
            restoreOfferText({ elementId: "a", connections, removedBy: side }, translate);
        }
    }
    for (const count of [0, 1, 2]) {
        openConflictsText(count, translate);
        buildBlockedText(count, translate);
        reviewNotesText(count, translate);
    }
    const blocks: MergePaneBlock[] = [
        ...keysOf(OBSTACLES)
            .filter((obstacle) => !(obstacle in WITH_MISSING))
            .map((obstacle) => ({ elementId: "a", targetId: "b", obstacle }) as MergePaneBlock),
        ...keysOf(WITH_MISSING).flatMap((obstacle) =>
            (["target", "part"] as const).map((missing) => ({
                elementId: "a",
                targetId: "b",
                obstacle,
                missing,
            })),
        ),
    ];
    for (const block of blocks) blockText(block, nameOf, translate);
    for (const action of keysOf(ACTIONS)) {
        outcomeHeadline(
            { applied: true, action, elementId: "a", pulledIn: [], dropped: [], reopened: [] },
            nameOf,
            translate,
        );
        outcomeHeadline(
            { applied: false, action, elementId: "a", blockedBy: [] },
            nameOf,
            translate,
        );
    }
    for (const note of Object.values(NOTES)) buildNoteText(note, nameOf, translate);
    return keys;
}

const locales = Object.keys(extras) as (keyof typeof extras)[];

function translateIn(locale: keyof typeof extras) {
    return (key: string) => extras[locale]?.[key] ?? "";
}

function sideInitial(locale: keyof typeof extras, side: MergeSide): string {
    const word = mergeCaptionText({ side, role: "unknown" }, translateIn(locale));
    return ([...word][0] ?? "").toUpperCase();
}

function sideLetter(locale: keyof typeof extras, side: MergeSide): string {
    return pickBadgeText({ keptSide: side, scope: "element" }, translateIn(locale)).letter;
}

describe("the merge view's translations", () => {
    it.each(locales)("%s translates every merge text", (locale) => {
        const dictionary = extras[locale] ?? {};
        const untranslated = [...mergeTextKeys()].filter((key) => !dictionary[key]);

        expect(untranslated).toEqual([]);
    });

    it.each(locales)("%s marks a badge with the first letter of its side's word", (locale) => {
        const letters = MERGE_SIDES.map((side) => ({
            side,
            letter: sideLetter(locale, side),
            initial: sideInitial(locale, side),
        }));

        for (const { side, letter, initial } of letters) {
            expect({ side, length: [...letter].length, letter }).toEqual({
                side,
                length: 1,
                letter: initial,
            });
        }
        expect(letters[0]?.letter).not.toBe(letters[1]?.letter);
    });
});
