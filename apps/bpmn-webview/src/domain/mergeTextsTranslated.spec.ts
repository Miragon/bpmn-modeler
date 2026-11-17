import { describe, expect, it } from "vitest";

import type { MergePaneBuildNote, MergePickScope } from "@miragon/bpmn-modeler-shared";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    MERGE_CAPTION_ROLES,
    MERGE_MARKERS,
    MERGE_SIDES,
    type MergeSide,
} from "@miragon/bpmn-modeler-types";

import {
    buildBlockedText,
    decisionButtonText,
    MERGE_MARKER_LABELS,
    MERGE_MENU_TEXTS,
    MERGE_STEP_TEXTS,
    markerCountTip,
    mergeCaptionText,
    openConflictsText,
    openShapelessConflictsText,
    reviewNotesText,
    shapelessHeadingText,
} from "./mergeBarTexts";
import {
    buildNoteText,
    compareWithText,
    comparisonPaneText,
    comparisonText,
    keepSideText,
    MERGE_BUILD_TEXTS,
    MERGE_MARK_TEXTS,
    MERGE_PICK_TEXTS,
    outcomeCardHeadline,
    pickBadgeText,
    restoreOfferText,
} from "./mergeTexts";

// Records, so the compiler names a kind the merge adds and this spec misses.
const PICK_SCOPES: Record<MergePickScope, true> = {
    element: true,
    withContents: true,
    withConnections: true,
};
const NOTES: Record<MergePaneBuildNote["kind"], MergePaneBuildNote> = {
    flowEndsFromDifferentSides: { kind: "flowEndsFromDifferentSides", id: "a", ends: ["b"] },
    addedAtSamePlace: { kind: "addedAtSamePlace", ids: ["a", "b"] },
    drawnApartFromContainer: { kind: "drawnApartFromContainer", id: "a", containers: ["b"] },
    restoredWithoutConnections: { kind: "restoredWithoutConnections", id: "a", connections: ["b"] },
    layoutChangedByBoth: { kind: "layoutChangedByBoth", ids: ["a"], keptSide: "current" },
    frameDiffers: { kind: "frameDiffers", attribute: "exporter" },
};
// English only for now: not yet in the locale files. A key leaves once every locale has it.
const AWAITING_TRANSLATION: ReadonlySet<string> = new Set([
    // The bar's count tooltips.
    "Elements of this version the result keeps as they are here.",
    "Elements of this version the result takes from the other version, or leaves out as the other version removed them.",
    "Open conflicts on elements this version has.",
    "Elements only the other version has are counted on the other pane only.",
    // The "…" menu.
    "More actions",
    "This step has no shape, so it is listed here.",
    "Not visible in the diagram ({count})",
    "1 open conflict not visible in the diagram",
    "{count} open conflicts not visible in the diagram",
    // A menu row's decisions.
    "Keep current with everything inside",
    "Keep incoming with everything inside",
    "Leave out",
    "Also keep its removed flows",
    // The build note on a layout both sides changed.
    "Both sides changed the layout of {elements}; current's is kept",
    "Both sides changed the layout of {elements}; incoming's is kept",
]);

const keysOf = <Kind extends string>(record: Record<Kind, unknown>) =>
    Object.keys(record) as Kind[];

/** Every key the merge texts pass to translate, gathered by asking for each text once. */
function mergeTextKeys(): Set<string> {
    const keys = new Set<string>([
        ...Object.values(MERGE_MARKER_LABELS),
        ...Object.values(MERGE_STEP_TEXTS),
        ...Object.values(MERGE_MARK_TEXTS),
        ...Object.values(MERGE_PICK_TEXTS),
        ...Object.values(MERGE_BUILD_TEXTS),
        ...Object.values(MERGE_MENU_TEXTS),
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
        keepSideText(side, translate);
        compareWithText(side, translate);
        comparisonText(side, translate);
        comparisonPaneText("before", side, translate);
        comparisonPaneText("after", side, translate);
        for (const connections of [["f1"], ["f1", "f2"]]) {
            const offer = { elementId: "a", connections, removedBy: side };
            restoreOfferText(offer, translate);
            decisionButtonText({ kind: "keepRemovedFlows", side, offer }, translate);
        }
        for (const scope of ["element", "withContents"] as const) {
            decisionButtonText({ kind: "keep", scope, side }, translate);
        }
        decisionButtonText({ kind: "leaveOut", side, otherSideLacks: "removed" }, translate);
    }
    decisionButtonText({ kind: "undo", scope: "element" }, translate);
    for (const count of [0, 1, 2]) {
        openConflictsText(count, translate);
        buildBlockedText(count, translate);
        reviewNotesText(count, translate);
        shapelessHeadingText(count, translate);
        openShapelessConflictsText(count, translate);
        for (const marker of MERGE_MARKERS) markerCountTip(marker, count, translate);
    }
    outcomeCardHeadline(
        {
            applied: true,
            action: "unpick",
            elementId: "a",
            pulledIn: [],
            dropped: [],
            reopened: [],
        },
        { kind: "undo", elementId: "a", scope: "element", origin: "canvas" },
        nameOf,
        translate,
    );
    for (const note of Object.values(NOTES)) {
        buildNoteText(note, nameOf, translate);
        if (note.kind === "layoutChangedByBoth") {
            buildNoteText({ ...note, keptSide: "incoming" }, nameOf, translate);
        }
    }
    return keys;
}

const locales = Object.keys(extras) as (keyof typeof extras)[];

function translateIn(locale: keyof typeof extras) {
    return (key: string) => extras[locale]?.[key] ?? "";
}

describe("the merge view's translations", () => {
    it.each(locales)("%s translates every merge text but those awaiting translation", (locale) => {
        const dictionary = extras[locale] ?? {};
        const untranslated = [...mergeTextKeys()].filter(
            (key) => !dictionary[key] && !AWAITING_TRANSLATION.has(key),
        );

        expect(untranslated).toEqual([]);
    });

    it("lists only merge texts as awaiting translation, and only while a locale lacks them", () => {
        const keys = mergeTextKeys();
        const stale = [...AWAITING_TRANSLATION].filter(
            (key) => !keys.has(key) || locales.every((locale) => extras[locale]?.[key]),
        );

        expect(stale).toEqual([]);
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
});
