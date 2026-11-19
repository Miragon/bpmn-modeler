import { describe, expect, it } from "vitest";

import type {
    MergeObstacleKind,
    MergeObstacleWithMissing,
    MergePanePickAction,
    MergePaneBlock,
    MergePaneBuildNote,
    MergePaneContainerReach,
    MergePaneHandMergeRefusal,
    MergePaneOtherSideLack,
    MergePickScope,
} from "@miragon/bpmn-modeler-shared";
import { dictionaries } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";
import {
    MERGE_CAPTION_ROLES,
    MERGE_MARKERS,
    MERGE_SIDES,
    type MergeSide,
    otherSide,
} from "@miragon/bpmn-modeler-types";

import type { MergeActedDecision } from "./mergeActedDecision";
import type { MergeDecisionOutcome } from "./mergeDecisionOutcome";
import {
    buildBlockedText,
    MERGE_MARKER_LABELS,
    MERGE_MENU_TEXTS,
    MERGE_STEP_TEXTS,
    markerCountTip,
    mergeCaptionText,
    openConflictsText,
    openShapelessConflictsText,
    reviewNotesText,
} from "./mergeBarTexts";
import type { MergePadDecision } from "./mergePadDecisions";
import {
    decisionButtonText,
    shapelessEntryText,
    shapelessHeadingText,
    shapelessValueLines,
} from "./mergeRowTexts";
import { buildNoteText } from "./mergeBuildNoteTexts";
import {
    dropAndResendText,
    handMergeHeadline,
    handMergeRefusalDetail,
    handMergeRefusalHeadline,
    handMergesAtStakeText,
    keepVersionText,
    MERGE_XML_TEXTS,
} from "./mergeHandMergeTexts";
import {
    cardBlockText,
    compareWithText,
    comparisonPaneText,
    comparisonText,
    flowNameText,
    keepSideText,
    MERGE_BUILD_TEXTS,
    MERGE_CARD_TEXTS,
    MERGE_MARK_TEXTS,
    MERGE_PAD_TEXTS,
    MERGE_PICK_TEXTS,
    moreReasonsText,
    outcomeCardHeadline,
    padDecisionText,
    pickBadgeText,
    restoreOfferText,
    unblockedText,
} from "./mergeTexts";

// Records, so the compiler names a kind the merge adds and this spec misses.
const PICK_SCOPES: Record<MergePickScope, true> = {
    element: true,
    withContents: true,
    withRemoved: true,
};
const REACHES: Record<MergePaneContainerReach, true> = { contents: true, poolProcesses: true };
const LACKS: Record<MergePaneOtherSideLack, true> = { removed: true, missing: true };
const ACTIONS: Record<MergePanePickAction, true> = { pick: true, leaveOut: true, unpick: true };
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
const OBSTACLES_WITH_MISSING: Record<MergeObstacleWithMissing, true> = {
    targetPickedWithout: true,
    sideLacksTarget: true,
};
const NOTES: Record<MergePaneBuildNote["kind"], MergePaneBuildNote> = {
    flowEndOffShape: { kind: "flowEndOffShape", id: "a", shapes: ["b"], repair: "movedByBuild" },
    shapesOverlap: { kind: "shapesOverlap", ids: ["a", "b"], repair: "movedByBuild", moved: "b" },
    flowThroughShape: { kind: "flowThroughShape", id: "a", shapes: ["b"], repair: "movedByBuild" },
    shapeOutsideContainer: {
        kind: "shapeOutsideContainer",
        id: "a",
        shapes: ["b"],
        repair: "movedIntoContainer",
    },
    boundaryEventOffHost: { kind: "boundaryEventOffHost", id: "a", host: "b" },
    lanesOverlap: { kind: "lanesOverlap", ids: ["a", "b"] },
    restoredWithoutRemovedWith: { kind: "restoredWithoutRemovedWith", id: "a", connections: ["b"] },
    defaultFlowNotRestored: { kind: "defaultFlowNotRestored", id: "a", flow: "b" },
    layoutChangedByBoth: { kind: "layoutChangedByBoth", ids: ["a"], keptSide: "current" },
    frameDiffers: { kind: "frameDiffers", attribute: "exporter" },
    flowNotDrawn: { kind: "flowNotDrawn", id: "a", source: "b", target: "c" },
};

/** Every refusal of a merge by hand, each detail's variants included. */
const HAND_MERGE_REFUSALS: Record<
    MergePaneHandMergeRefusal["kind"],
    readonly MergePaneHandMergeRefusal[]
> = {
    conflictMarkersLeft: [{ kind: "conflictMarkersLeft" }],
    unparsable: [{ kind: "unparsable", detail: "x" }],
    notOneElement: [{ kind: "notOneElement", found: 2 }],
    typeChanged: [{ kind: "typeChanged", expected: "bpmn:Task", found: "bpmn:UserTask" }],
    idChanged: [
        { kind: "idChanged", expected: "a", found: "b" },
        { kind: "idChanged", expected: "a" },
    ],
    holdsElementsOfTheirOwn: [{ kind: "holdsElementsOfTheirOwn", ids: ["a"] }],
    beyondOwnAttributes: [{ kind: "beyondOwnAttributes", properties: ["bpmn:flowElements"] }],
    namesWrongType: [
        {
            kind: "namesWrongType",
            references: [{ property: "bpmn:messageRef", target: "a", expected: "bpmn:Message" }],
        },
    ],
    unknownNamespace: [{ kind: "unknownNamespace", namespaces: ["urn:x"] }],
    rejectedByEngine: [{ kind: "rejectedByEngine", detail: "x" }],
    changesStructure: [{ kind: "changesStructure", properties: ["bpmn:sourceRef"] }],
    namesMissingElement: [{ kind: "namesMissingElement", ids: ["a"] }],
    namesLeftOutElement: [{ kind: "namesLeftOutElement", ids: ["a"] }],
    changesOtherDecisions: [{ kind: "changesOtherDecisions", ids: ["a"] }],
    notHandMergeable: [{ kind: "notHandMergeable" }],
};

// Every root element type, and the data object, which no canvas draws.
const SHAPELESS_TYPES = [
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
];

const keysOf = <Kind extends string>(record: Record<Kind, unknown>) =>
    Object.keys(record) as Kind[];

/** What a restore offer can hold: one or more flows, a boundary event alone, or both. */
const OFFERED: readonly { connections: string[]; boundaryEvents?: string[] }[] = [
    { connections: ["f1"] },
    { connections: ["f1", "f2"] },
    { connections: [], boundaryEvents: ["b1"] },
    { connections: ["f1"], boundaryEvents: ["b1"] },
];

/** Every pad decision of each kind for `side`, over every reach, lack, connection count and scope. */
const PAD_DECISIONS: Record<MergePadDecision["kind"], (side: MergeSide) => MergePadDecision[]> = {
    keep: (side) => [
        { kind: "keep", scope: "element", side },
        ...keysOf(REACHES).map((reach): MergePadDecision => ({
            kind: "keep",
            scope: "withContents",
            side,
            reach,
        })),
    ],
    leaveOut: (side) =>
        keysOf(LACKS).map((otherSideLacks) => ({ kind: "leaveOut", side, otherSideLacks })),
    keepRemovedWith: (side) =>
        OFFERED.map((offered) => ({
            kind: "keepRemovedWith",
            side: otherSide(side),
            offer: { elementId: "a", ...offered, removedBy: side },
        })),
    undo: () => keysOf(PICK_SCOPES).map((scope) => ({ kind: "undo", scope })),
    mergeXml: () => [
        { kind: "mergeXml", mode: "open" },
        { kind: "mergeXml", mode: "edit" },
    ],
};

/** Every decision the outcome card can head, for `side`. */
const ACTED_DECISIONS: Record<
    MergeActedDecision["kind"],
    (side: MergeSide) => MergeActedDecision[]
> = {
    keep: (side) =>
        keysOf(PICK_SCOPES).map((scope) => ({
            kind: "keep",
            elementId: "a",
            scope,
            side,
            origin: "canvas",
        })),
    leaveOut: (side) =>
        keysOf(LACKS).map((otherSideLacks) => ({
            kind: "leaveOut",
            elementId: "a",
            side,
            otherSideLacks,
            origin: "canvas",
        })),
    undo: () =>
        keysOf(PICK_SCOPES).map((scope) => ({
            kind: "undo",
            elementId: "a",
            scope,
            origin: "canvas",
        })),
};

const hasMissing = (obstacle: MergeObstacleKind): obstacle is MergeObstacleWithMissing =>
    obstacle in OBSTACLES_WITH_MISSING;

/** Every block of `obstacle`, missing the whole target or a part where the obstacle tells. */
function blocksOf(obstacle: MergeObstacleKind): MergePaneBlock[] {
    const ids = { elementId: "a", targetId: "b" };
    return hasMissing(obstacle)
        ? (["target", "part"] as const).map((missing) => ({ ...ids, obstacle, missing }))
        : [{ ...ids, obstacle }];
}

/** Every key the merge texts pass to translate, gathered by asking for each text once. */
function mergeTextKeys(): Set<string> {
    const keys = new Set<string>([
        ...Object.values(MERGE_MARKER_LABELS),
        ...Object.values(MERGE_STEP_TEXTS),
        ...Object.values(MERGE_MARK_TEXTS),
        ...Object.values(MERGE_PICK_TEXTS),
        ...Object.values(MERGE_PAD_TEXTS),
        ...Object.values(MERGE_CARD_TEXTS),
        ...Object.values(MERGE_BUILD_TEXTS),
        ...Object.values(MERGE_MENU_TEXTS),
        ...Object.values(MERGE_XML_TEXTS),
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
        for (const scope of keysOf(PICK_SCOPES)) {
            pickBadgeText({ keptSide: side, scope }, translate);
            pickBadgeText({ keptSide: side, scope, mergedByHand: true }, translate);
        }
        keepSideText(side, translate);
        keepVersionText(side, translate);
        compareWithText(side, translate);
        comparisonText(side, translate);
        comparisonPaneText("before", side, translate);
        comparisonPaneText("after", side, translate);
        for (const offered of OFFERED) {
            restoreOfferText({ elementId: "a", ...offered, removedBy: side }, translate);
        }
        for (const decisions of Object.values(PAD_DECISIONS)) {
            for (const decision of decisions(side)) {
                padDecisionText(decision, translate);
                if (decision.kind !== "keep" || decision.scope !== "withContents") {
                    decisionButtonText(decision, translate);
                }
            }
        }
        for (const decisions of Object.values(ACTED_DECISIONS)) {
            for (const acted of decisions(side)) {
                for (const reopened of [[], ["a"]]) {
                    const outcome: MergeDecisionOutcome = {
                        applied: true,
                        action: "pick",
                        elementId: "a",
                        pulledIn: [],
                        dropped: [],
                        reopened,
                    };
                    outcomeCardHeadline(outcome, acted, nameOf, translate);
                }
            }
        }
        for (const lack of keysOf(LACKS)) {
            shapelessValueLines({ lackingSide: { side, lack }, differences: [] }, translate);
        }
    }
    for (const action of keysOf(ACTIONS)) {
        const refusal: MergeDecisionOutcome = {
            applied: false,
            action,
            elementId: "a",
            blockedBy: [],
        };
        outcomeCardHeadline(refusal, ACTED_DECISIONS.undo("current")[0]!, nameOf, translate);
        unblockedText(action, "a", translate);
        dropAndResendText(action, translate);
    }
    for (const refusals of Object.values(HAND_MERGE_REFUSALS)) {
        for (const refusal of refusals) {
            handMergeRefusalHeadline(refusal, "a", translate);
            handMergeRefusalDetail(refusal, nameOf, translate);
        }
    }
    handMergeHeadline("accepted", "a", translate);
    handMergeHeadline("discarded", "a", translate);
    handMergesAtStakeText(["a"], nameOf, translate);
    for (const obstacle of keysOf(OBSTACLES)) {
        for (const block of blocksOf(obstacle)) {
            for (const cardElementId of [block.elementId, block.targetId]) {
                cardBlockText(block, cardElementId, nameOf, translate);
            }
        }
    }
    for (const type of SHAPELESS_TYPES) shapelessEntryText({ id: "a", type }, translate);
    moreReasonsText(2, translate);
    flowNameText("a", "b", translate);
    const attributeOnOneSide = { attribute: "errorCode", current: "E1" };
    shapelessValueLines({ differences: [attributeOnOneSide] }, translate);
    shapelessValueLines({ differences: [], moreDiffers: true }, translate);
    for (const count of [0, 1, 2]) {
        openConflictsText(count, translate);
        buildBlockedText(count, translate);
        reviewNotesText(count, translate);
        shapelessHeadingText(count, translate);
        openShapelessConflictsText(count, translate);
        for (const marker of MERGE_MARKERS) markerCountTip(marker, count, translate);
    }
    for (const note of Object.values(NOTES)) {
        buildNoteText(note, nameOf, translate);
        if (note.kind === "layoutChangedByBoth") {
            buildNoteText({ ...note, keptSide: "incoming" }, nameOf, translate);
        }
        if (note.kind === "flowEndOffShape" || note.kind === "flowThroughShape") {
            buildNoteText({ ...note, repair: "notRepaired" }, nameOf, translate);
        }
        if (note.kind === "shapesOverlap") {
            const { ids } = note;
            buildNoteText({ kind: note.kind, ids, repair: "notRepaired" }, nameOf, translate);
            const madeRoom = { repair: "madeRoom", moved: "b", shifted: ["c"] } as const;
            buildNoteText({ kind: note.kind, ids, ...madeRoom }, nameOf, translate);
        }
        if (note.kind === "shapeOutsideContainer") {
            const { id, shapes } = note;
            buildNoteText(
                { kind: note.kind, id, shapes, repair: "notRepaired" },
                nameOf,
                translate,
            );
            for (const shifted of [[], ["c"]]) {
                const grew = { repair: "grewContainer", shifted } as const;
                buildNoteText({ kind: note.kind, id, shapes, ...grew }, nameOf, translate);
            }
        }
        if (note.kind === "defaultFlowNotRestored") {
            buildNoteText({ ...note, keptDefault: "c" }, nameOf, translate);
        }
        if (note.kind === "restoredWithoutRemovedWith") {
            buildNoteText({ ...note, boundaryEvents: ["c"] }, nameOf, translate);
            buildNoteText({ ...note, connections: [], boundaryEvents: ["c"] }, nameOf, translate);
        }
        if (note.kind === "flowNotDrawn") {
            buildNoteText({ kind: note.kind, id: note.id, target: "c" }, nameOf, translate);
        }
    }
    return keys;
}

const locales = Object.keys(extras) as (keyof typeof extras)[];

function translateIn(locale: keyof typeof extras) {
    return (key: string) => extras[locale]?.[key] ?? "";
}

describe("the merge view's translations", () => {
    // The modeler looks a key up in the shared library and the overlay together.
    it.each(locales)("%s translates every merge text", (locale) => {
        const dictionary = { ...dictionaries[locale], ...extras[locale] };
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
                compareWithText(side, translate),
                comparisonText(side, translate),
                comparisonPaneText("before", side, translate),
                ...keysOf(PICK_SCOPES).flatMap((scope) => [
                    pickBadgeText({ keptSide: side, scope }, translate).label,
                    pickBadgeText({ keptSide: side, scope, mergedByHand: true }, translate).label,
                ]),
                keepVersionText(side, translate),
                ...OFFERED.map((offered) =>
                    restoreOfferText({ elementId: "a", ...offered, removedBy: side }, translate),
                ),
                ...[...PAD_DECISIONS.keep(side), ...PAD_DECISIONS.leaveOut(side)].map(
                    (decision) => padDecisionText(decision, translate).label,
                ),
                ...[...ACTED_DECISIONS.keep(side), ...ACTED_DECISIONS.leaveOut(side)].map((acted) =>
                    outcomeCardHeadline(
                        {
                            applied: true,
                            action: "pick",
                            elementId: "a",
                            pulledIn: [],
                            dropped: [],
                            reopened: [],
                        },
                        acted,
                        (id) => id,
                        translate,
                    ),
                ),
                ...keysOf(LACKS).flatMap((lack) =>
                    shapelessValueLines({ lackingSide: { side, lack }, differences: [] }, translate)
                        .flat()
                        .map(({ text }) => text),
                ),
                buildNoteText(
                    { kind: "layoutChangedByBoth", ids: ["a"], keptSide: side },
                    (id) => id,
                    translate,
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
        const translate = translateIn(locale);
        const block: MergePaneBlock = {
            elementId: "a",
            targetId: "b",
            obstacle: "idHeldByAnother",
        };
        const texts = [
            cardBlockText(block, "c", (id) => id, translate),
            cardBlockText(block, "b", (id) => id, translate),
        ];

        expect(texts.filter((text) => !text.includes("ID"))).toEqual([]);
    });
});
