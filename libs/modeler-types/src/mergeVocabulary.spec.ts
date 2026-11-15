import { describe, expect, expectTypeOf, it } from "vitest";

import mergeVocabularySource from "./mergeVocabulary.ts?raw";

import {
    MERGE_CAPTION_ROLES,
    MERGE_MARKER_CLASSES,
    MERGE_MARKERS,
    MERGE_SIDES,
    type MergeCaptionRole,
    type MergeMarker,
    type MergeSide,
    type MergeSideCaption,
} from "./mergeVocabulary";
import { DIFF_MARKERS, DIFF_SELECTED_MARKER } from "./diffVocabulary";

const EVERY_SIDE: Record<MergeSide, true> = { current: true, incoming: true };

const EVERY_MARKER: Record<MergeMarker, true> = {
    takenFromThisSide: true,
    takenFromOtherSide: true,
    conflict: true,
};

const EVERY_CAPTION_ROLE: Record<MergeCaptionRole, true> = {
    branch: true,
    upstream: true,
    yourCommit: true,
    stash: true,
    unknown: true,
};

function namesEveryValueOnce(list: readonly string[], every: Record<string, true>): void {
    expect(new Set(list).size).toBe(list.length);
    expect([...list].sort()).toEqual(Object.keys(every).sort());
}

describe("MERGE_SIDES", () => {
    it("names both sides of a merge, current first", () => {
        namesEveryValueOnce(MERGE_SIDES, EVERY_SIDE);
        expect(MERGE_SIDES[0]).toBe("current");
        expectTypeOf<(typeof MERGE_SIDES)[number]>().toEqualTypeOf<MergeSide>();
    });
});

describe("MERGE_MARKERS", () => {
    it("names every marker a merge pane paints once", () => {
        namesEveryValueOnce(MERGE_MARKERS, EVERY_MARKER);
        expectTypeOf<(typeof MERGE_MARKERS)[number]>().toEqualTypeOf<MergeMarker>();
    });
});

describe("MERGE_MARKER_CLASSES", () => {
    it("gives every marker its own CSS class", () => {
        const classes = Object.values(MERGE_MARKER_CLASSES);

        expect(Object.keys(MERGE_MARKER_CLASSES).sort()).toEqual(Object.keys(EVERY_MARKER).sort());
        expect(new Set(classes).size).toBe(classes.length);
    });

    it("keeps clear of the diff's classes, so a diff repaint never clears a merge mark", () => {
        const diffClasses: readonly string[] = [
            ...Object.values(DIFF_MARKERS),
            DIFF_SELECTED_MARKER,
        ];

        for (const mergeClass of Object.values(MERGE_MARKER_CLASSES)) {
            expect(diffClasses).not.toContain(mergeClass);
        }
    });
});

describe("MERGE_CAPTION_ROLES", () => {
    it("names every role a pane caption can give its side once", () => {
        namesEveryValueOnce(MERGE_CAPTION_ROLES, EVERY_CAPTION_ROLE);
        expectTypeOf<(typeof MERGE_CAPTION_ROLES)[number]>().toEqualTypeOf<MergeCaptionRole>();
    });
});

describe("MergeSideCaption", () => {
    it("is plain data a protocol message can carry", () => {
        const caption: MergeSideCaption = {
            side: "incoming",
            role: "branch",
            ref: "feature",
            shortHash: "1a2b3c4",
            subject: "Add the approval step",
        };

        expect(JSON.parse(JSON.stringify(caption))).toEqual(caption);
    });
});

describe("mergeVocabulary.ts", () => {
    it("imports nothing at runtime, so a DOM-free workspace can load it alone", () => {
        const runtimeImport = /^(?:import|export)\s(?!type\s)(?:[^;]*from\s+)?["']/m;

        expect(mergeVocabularySource).not.toMatch(runtimeImport);
    });
});
