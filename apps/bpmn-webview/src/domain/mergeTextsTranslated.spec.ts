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
    layoutChangedByBoth: { kind: "layoutChangedByBoth", ids: ["a"], keptSide: "current" },
    frameDiffers: { kind: "frameDiffers", attribute: "exporter" },
};
// English only for now: not yet in the locale files.
const AWAITING_TRANSLATION: ReadonlySet<MergePaneBuildNote["kind"]> = new Set([
    "layoutChangedByBoth",
]);

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
    for (const note of Object.values(NOTES)) {
        if (!AWAITING_TRANSLATION.has(note.kind)) buildNoteText(note, nameOf, translate);
    }
    return keys;
}

const locales = Object.keys(extras) as (keyof typeof extras)[];

function translateIn(locale: keyof typeof extras) {
    return (key: string) => extras[locale]?.[key] ?? "";
}

describe("the merge view's translations", () => {
    it.each(locales)("%s translates every merge text", (locale) => {
        const dictionary = extras[locale] ?? {};
        const untranslated = [...mergeTextKeys()].filter((key) => !dictionary[key]);

        expect(untranslated).toEqual([]);
    });

    it.each(locales)("%s names a badge's side with the word the pane's caption uses", (locale) => {
        const translate = translateIn(locale);
        for (const side of MERGE_SIDES) {
            expect(pickBadgeText({ keptSide: side, scope: "element" }, translate).side).toBe(
                mergeCaptionText({ side, role: "unknown" }, translate),
            );
        }
    });

    // VS Code's own conflict actions ("Accept Incoming Change") in its language packs.
    // VS Code ships no Dutch pack.
    const VS_CODE_SIDE_WORDS: Partial<Record<keyof typeof extras, Record<MergeSide, string>>> = {
        "de": { current: "Aktuell", incoming: "Eingehend" },
        "es": { current: "Actual", incoming: "Entrante" },
        "fr": { current: "Actuel", incoming: "Entrant" },
        "it": { current: "Corrente", incoming: "In ingresso" },
        "ja": { current: "現在", incoming: "入力側" },
        "ko": { current: "현재", incoming: "수신" },
        "pt-br": { current: "Atual", incoming: "Entrada" },
        "ru": { current: "Текущее", incoming: "Входящее" },
        "zh-Hans": { current: "当前", incoming: "传入" },
        "zh-Hant": { current: "目前", incoming: "傳入" },
    };

    it.each(Object.entries(VS_CODE_SIDE_WORDS))(
        "%s names the sides as VS Code's conflict actions do",
        (locale, words) => {
            const translate = translateIn(locale as keyof typeof extras);
            const sideWords = Object.fromEntries(
                MERGE_SIDES.map((side) => [
                    side,
                    mergeCaptionText({ side, role: "unknown" }, translate),
                ]),
            );

            expect(sideWords).toEqual(words);
        },
    );

    it.each(locales)("%s repeats the side's word in every text that names the side", (locale) => {
        const translate = translateIn(locale);
        for (const side of MERGE_SIDES) {
            const word = mergeCaptionText({ side, role: "unknown" }, translate).toLowerCase();
            const texts = [
                keepSideText(side, translate),
                pickNotDrawnText(side, "Task", translate),
                compareWithText(side, translate),
                comparisonText(side, translate),
                comparisonPaneText("before", side, translate),
                ...keysOf(PICK_SCOPES).map(
                    (scope) => pickBadgeText({ keptSide: side, scope }, translate).label,
                ),
                ...[["f1"], ["f1", "f2"]].map((connections) =>
                    restoreOfferText({ elementId: "a", connections, removedBy: side }, translate),
                ),
            ];
            const missing = texts.filter((text) => !text.toLowerCase().includes(word));

            expect({ side, missing }).toEqual({ side, missing: [] });
        }
        const keptFromCurrent = buildNoteText(NOTES.frameDiffers, (id) => id, translate);
        expect(keptFromCurrent.toLowerCase()).toContain(
            mergeCaptionText({ side: "current", role: "unknown" }, translate).toLowerCase(),
        );
    });

    it.each(locales)("%s spells ID as the shared library does", (locale) => {
        const sameId = blockText(
            { elementId: "a", targetId: "b", obstacle: "idHeldByAnother" } as MergePaneBlock,
            (id) => id,
            translateIn(locale),
        );

        expect(sameId).toContain("ID");
    });
});
