import { describe, expect, it } from "vitest";

import {
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

describe("planSourceCacheRefresh", () => {
    it.each<{
        behaviour: string;
        cachedSourceIndexes: number[];
        outcomes: SourceFetchOutcome[];
        expected: SourceSlotAction[];
    }>([
        {
            behaviour: "replaces the slot of a source that was fetched",
            cachedSourceIndexes: [0],
            outcomes: [{ kind: "fetched", sourceIndex: 0, files: [template] }],
            expected: [{ kind: "replace", sourceIndex: 0, files: [template] }],
        },
        {
            behaviour: "replaces the slot of a fetched source that now serves no files",
            cachedSourceIndexes: [0],
            outcomes: [{ kind: "fetched", sourceIndex: 0, files: [] }],
            expected: [{ kind: "replace", sourceIndex: 0, files: [] }],
        },
        {
            behaviour: "fills the slot of a source fetched for the first time",
            cachedSourceIndexes: [],
            outcomes: [{ kind: "fetched", sourceIndex: 0, files: [template] }],
            expected: [{ kind: "replace", sourceIndex: 0, files: [template] }],
        },
        {
            behaviour: "keeps the last good slot of a source whose fetch failed",
            cachedSourceIndexes: [0],
            outcomes: [{ kind: "failed", sourceIndex: 0 }],
            expected: [{ kind: "keep", sourceIndex: 0 }],
        },
        {
            behaviour: "removes a cached slot the manifest no longer lists",
            cachedSourceIndexes: [0, 1],
            outcomes: [{ kind: "fetched", sourceIndex: 0, files: [template] }],
            expected: [
                { kind: "replace", sourceIndex: 0, files: [template] },
                { kind: "remove", sourceIndex: 1 },
            ],
        },
        {
            behaviour: "removes every cached slot when the manifest lists no source",
            cachedSourceIndexes: [0, 1],
            outcomes: [],
            expected: [
                { kind: "remove", sourceIndex: 0 },
                { kind: "remove", sourceIndex: 1 },
            ],
        },
        {
            behaviour: "replaces, keeps and removes side by side",
            cachedSourceIndexes: [0, 1, 2],
            outcomes: [
                { kind: "fetched", sourceIndex: 0, files: [template] },
                { kind: "failed", sourceIndex: 1 },
            ],
            expected: [
                { kind: "replace", sourceIndex: 0, files: [template] },
                { kind: "keep", sourceIndex: 1 },
                { kind: "remove", sourceIndex: 2 },
            ],
        },
        {
            behaviour: "plans nothing for an empty cache and an empty manifest",
            cachedSourceIndexes: [],
            outcomes: [],
            expected: [],
        },
    ])("$behaviour", ({ cachedSourceIndexes, outcomes, expected }) => {
        expect(planSourceCacheRefresh(cachedSourceIndexes, outcomes)).toEqual(expected);
    });
});
