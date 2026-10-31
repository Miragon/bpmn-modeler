import { describe, expect, it } from "vitest";

import {
    CachedSourceSlot,
    FetchedTemplateFile,
    formatSourceSlotRecord,
    nextSourceSlotRecord,
    parseSourceSlotRecord,
    planSourceCacheRefresh,
    SourceFetchOutcome,
    SourceSlotAction,
    SourceSlotRecord,
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

describe("parseSourceSlotRecord", () => {
    it.each<{ behaviour: string; text: string; record: SourceSlotRecord | undefined }>([
        {
            behaviour: "reads the source and the generation",
            text: '{"source":"source a","generation":3}',
            record: { source: SOURCE_A, generation: 3 },
        },
        {
            behaviour: "reads what formatSourceSlotRecord wrote",
            text: formatSourceSlotRecord({ source: SOURCE_B, generation: 12 }),
            record: { source: SOURCE_B, generation: 12 },
        },
        {
            behaviour: "rejects a torn write",
            text: '{"source":"sour',
            record: undefined,
        },
        {
            behaviour: "rejects an empty file",
            text: "",
            record: undefined,
        },
        {
            behaviour: "rejects JSON that is no object",
            text: "null",
            record: undefined,
        },
        {
            behaviour: "rejects a record without a source",
            text: '{"generation":1}',
            record: undefined,
        },
        {
            behaviour: "rejects a source that is no string",
            text: '{"source":7,"generation":1}',
            record: undefined,
        },
        {
            behaviour: "rejects a record without a generation",
            text: '{"source":"source a"}',
            record: undefined,
        },
        {
            behaviour: "rejects a generation spelled as a string",
            text: '{"source":"source a","generation":"1"}',
            record: undefined,
        },
        {
            behaviour: "rejects a fractional generation",
            text: '{"source":"source a","generation":1.5}',
            record: undefined,
        },
    ])("$behaviour", ({ text, record }) => {
        expect(parseSourceSlotRecord(text)).toEqual(record);
    });
});

describe("formatSourceSlotRecord", () => {
    it("writes only the source and the generation", () => {
        const recordWithExtras = { source: SOURCE_A, generation: 2, files: ["a.json"] };

        expect(JSON.parse(formatSourceSlotRecord(recordWithExtras))).toEqual({
            source: SOURCE_A,
            generation: 2,
        });
    });
});

describe("nextSourceSlotRecord", () => {
    it.each<{
        behaviour: string;
        current: SourceSlotRecord | undefined;
        source: string;
        next: SourceSlotRecord;
    }>([
        {
            behaviour: "starts a slot without a record at generation 1",
            current: undefined,
            source: SOURCE_A,
            next: { source: SOURCE_A, generation: 1 },
        },
        {
            behaviour: "moves a slot to the generation after its live one",
            current: { source: SOURCE_A, generation: 4 },
            source: SOURCE_A,
            next: { source: SOURCE_A, generation: 5 },
        },
        {
            behaviour: "records the source that now fills the slot",
            current: { source: SOURCE_B, generation: 1 },
            source: SOURCE_A,
            next: { source: SOURCE_A, generation: 2 },
        },
    ])("$behaviour", ({ current, source, next }) => {
        expect(nextSourceSlotRecord(current, source)).toEqual(next);
    });
});
