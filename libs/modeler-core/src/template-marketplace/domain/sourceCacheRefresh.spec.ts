import { describe, expect, it } from "vitest";

import {
    CachedSourceSlot,
    FetchedTemplateFile,
    planSourceCacheRefresh,
    SourceFetchOutcome,
    SourceSlotAction,
} from "./sourceCacheRefresh";

const template: FetchedTemplateFile = {
    contentType: "element-templates",
    repoPath: "element-templates/a.json",
    content: "{}",
};
const SOURCE_A = "source a";
const SOURCE_B = "source b";
const SOURCE_C = "source c";

describe("planSourceCacheRefresh", () => {
    it.each<{
        behaviour: string;
        cachedSlots: CachedSourceSlot[];
        outcomes: SourceFetchOutcome[];
        expected: SourceSlotAction[];
    }>([
        {
            behaviour: "replaces the slot of a source that was fetched",
            cachedSlots: [{ sourceIndex: 0, source: SOURCE_A }],
            outcomes: [{ kind: "fetched", sourceIndex: 0, source: SOURCE_A, files: [template] }],
            expected: [{ kind: "replace", sourceIndex: 0, source: SOURCE_A, files: [template] }],
        },
        {
            behaviour: "replaces the slot of a fetched source that now serves no files",
            cachedSlots: [{ sourceIndex: 0, source: SOURCE_A }],
            outcomes: [{ kind: "fetched", sourceIndex: 0, source: SOURCE_A, files: [] }],
            expected: [{ kind: "replace", sourceIndex: 0, source: SOURCE_A, files: [] }],
        },
        {
            behaviour: "fills the slot of a source fetched for the first time",
            cachedSlots: [],
            outcomes: [{ kind: "fetched", sourceIndex: 0, source: SOURCE_A, files: [template] }],
            expected: [{ kind: "replace", sourceIndex: 0, source: SOURCE_A, files: [template] }],
        },
        {
            behaviour: "replaces a slot cached before slots recorded their source",
            cachedSlots: [{ sourceIndex: 0, source: undefined }],
            outcomes: [{ kind: "fetched", sourceIndex: 0, source: SOURCE_A, files: [template] }],
            expected: [{ kind: "replace", sourceIndex: 0, source: SOURCE_A, files: [template] }],
        },
        {
            behaviour: "empties the slot of another source before filling it",
            cachedSlots: [{ sourceIndex: 0, source: SOURCE_B }],
            outcomes: [{ kind: "fetched", sourceIndex: 0, source: SOURCE_A, files: [template] }],
            expected: [
                { kind: "remove", sourceIndex: 0, reason: "otherSource" },
                { kind: "replace", sourceIndex: 0, source: SOURCE_A, files: [template] },
            ],
        },
        {
            behaviour: "keeps the last good slot of a source whose fetch failed",
            cachedSlots: [{ sourceIndex: 0, source: SOURCE_A }],
            outcomes: [{ kind: "failed", sourceIndex: 0, source: SOURCE_A }],
            expected: [{ kind: "keep", sourceIndex: 0 }],
        },
        {
            behaviour: "keeps a failed source's slot cached before slots recorded their source",
            cachedSlots: [{ sourceIndex: 0, source: undefined }],
            outcomes: [{ kind: "failed", sourceIndex: 0, source: SOURCE_A }],
            expected: [{ kind: "keep", sourceIndex: 0 }],
        },
        {
            behaviour: "removes the slot of another source when the listed source failed",
            cachedSlots: [{ sourceIndex: 0, source: SOURCE_B }],
            outcomes: [{ kind: "failed", sourceIndex: 0, source: SOURCE_A }],
            expected: [{ kind: "remove", sourceIndex: 0, reason: "otherSource" }],
        },
        {
            behaviour: "keeps nothing for a failed source that was never cached",
            cachedSlots: [],
            outcomes: [{ kind: "failed", sourceIndex: 0, source: SOURCE_A }],
            expected: [{ kind: "keep", sourceIndex: 0 }],
        },
        {
            behaviour: "removes a cached slot the manifest no longer lists",
            cachedSlots: [
                { sourceIndex: 0, source: SOURCE_A },
                { sourceIndex: 1, source: SOURCE_B },
            ],
            outcomes: [{ kind: "fetched", sourceIndex: 0, source: SOURCE_A, files: [template] }],
            expected: [
                { kind: "replace", sourceIndex: 0, source: SOURCE_A, files: [template] },
                { kind: "remove", sourceIndex: 1, reason: "unlisted" },
            ],
        },
        {
            behaviour: "removes every cached slot when the manifest lists no source",
            cachedSlots: [
                { sourceIndex: 0, source: SOURCE_A },
                { sourceIndex: 1, source: undefined },
            ],
            outcomes: [],
            expected: [
                { kind: "remove", sourceIndex: 0, reason: "unlisted" },
                { kind: "remove", sourceIndex: 1, reason: "unlisted" },
            ],
        },
        {
            behaviour: "drops a swapped source's slot when its fetch failed",
            cachedSlots: [
                { sourceIndex: 0, source: SOURCE_A },
                { sourceIndex: 1, source: SOURCE_B },
            ],
            outcomes: [
                { kind: "failed", sourceIndex: 0, source: SOURCE_B },
                { kind: "fetched", sourceIndex: 1, source: SOURCE_A, files: [template] },
            ],
            expected: [
                { kind: "remove", sourceIndex: 0, reason: "otherSource" },
                { kind: "remove", sourceIndex: 1, reason: "otherSource" },
                { kind: "replace", sourceIndex: 1, source: SOURCE_A, files: [template] },
            ],
        },
        {
            behaviour: "replaces, keeps and removes side by side",
            cachedSlots: [
                { sourceIndex: 0, source: SOURCE_A },
                { sourceIndex: 1, source: SOURCE_B },
                { sourceIndex: 2, source: SOURCE_C },
            ],
            outcomes: [
                { kind: "fetched", sourceIndex: 0, source: SOURCE_A, files: [template] },
                { kind: "failed", sourceIndex: 1, source: SOURCE_B },
            ],
            expected: [
                { kind: "replace", sourceIndex: 0, source: SOURCE_A, files: [template] },
                { kind: "keep", sourceIndex: 1 },
                { kind: "remove", sourceIndex: 2, reason: "unlisted" },
            ],
        },
        {
            behaviour: "plans nothing for an empty cache and an empty manifest",
            cachedSlots: [],
            outcomes: [],
            expected: [],
        },
    ])("$behaviour", ({ cachedSlots, outcomes, expected }) => {
        expect(planSourceCacheRefresh(cachedSlots, outcomes)).toEqual(expected);
    });
});
