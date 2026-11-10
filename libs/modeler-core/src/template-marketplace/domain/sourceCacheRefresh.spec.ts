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
const FETCHED_AT = 1_700_000_000_000;

describe("planSourceCacheRefresh", () => {
    it.each<{
        behaviour: string;
        cachedSlots: CachedSourceSlot[];
        outcomes: SourceFetchOutcome[];
        expected: SourceSlotAction[];
    }>([
        {
            behaviour: "replaces the slot of a source that was fetched",
            cachedSlots: [{ sourceIndex: 0, sourceIdentity: SOURCE_A }],
            outcomes: [
                { kind: "fetched", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
            expected: [
                { kind: "replace", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
        },
        {
            behaviour: "replaces the slot of a fetched source that now serves no files",
            cachedSlots: [{ sourceIndex: 0, sourceIdentity: SOURCE_A }],
            outcomes: [{ kind: "fetched", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [] }],
            expected: [{ kind: "replace", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [] }],
        },
        {
            behaviour: "fills the slot of a source fetched for the first time",
            cachedSlots: [],
            outcomes: [
                { kind: "fetched", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
            expected: [
                { kind: "replace", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
        },
        {
            behaviour: "replaces a slot cached before slots recorded their source",
            cachedSlots: [{ sourceIndex: 0, sourceIdentity: undefined }],
            outcomes: [
                { kind: "fetched", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
            expected: [
                { kind: "replace", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
        },
        {
            behaviour: "empties the slot of another source before filling it",
            cachedSlots: [{ sourceIndex: 0, sourceIdentity: SOURCE_B }],
            outcomes: [
                { kind: "fetched", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
            expected: [
                { kind: "remove", sourceIndex: 0, reason: "otherSource" },
                { kind: "replace", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
        },
        {
            behaviour: "keeps the last good slot of a source whose fetch failed",
            cachedSlots: [{ sourceIndex: 0, sourceIdentity: SOURCE_A }],
            outcomes: [{ kind: "failed", sourceIndex: 0, sourceIdentity: SOURCE_A }],
            expected: [{ kind: "keep", sourceIndex: 0 }],
        },
        {
            behaviour: "keeps a failed source's slot cached before slots recorded their source",
            cachedSlots: [{ sourceIndex: 0, sourceIdentity: undefined }],
            outcomes: [{ kind: "failed", sourceIndex: 0, sourceIdentity: SOURCE_A }],
            expected: [{ kind: "keep", sourceIndex: 0 }],
        },
        {
            behaviour: "removes the slot of another source when the listed source failed",
            cachedSlots: [{ sourceIndex: 0, sourceIdentity: SOURCE_B }],
            outcomes: [{ kind: "failed", sourceIndex: 0, sourceIdentity: SOURCE_A }],
            expected: [{ kind: "remove", sourceIndex: 0, reason: "otherSource" }],
        },
        {
            behaviour: "keeps nothing for a failed source that was never cached",
            cachedSlots: [],
            outcomes: [{ kind: "failed", sourceIndex: 0, sourceIdentity: SOURCE_A }],
            expected: [{ kind: "keep", sourceIndex: 0 }],
        },
        {
            behaviour: "removes a cached slot the manifest no longer lists",
            cachedSlots: [
                { sourceIndex: 0, sourceIdentity: SOURCE_A },
                { sourceIndex: 1, sourceIdentity: SOURCE_B },
            ],
            outcomes: [
                { kind: "fetched", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
            ],
            expected: [
                { kind: "replace", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
                { kind: "remove", sourceIndex: 1, reason: "unlisted" },
            ],
        },
        {
            behaviour: "removes every cached slot when the manifest lists no source",
            cachedSlots: [
                { sourceIndex: 0, sourceIdentity: SOURCE_A },
                { sourceIndex: 1, sourceIdentity: undefined },
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
                { sourceIndex: 0, sourceIdentity: SOURCE_A },
                { sourceIndex: 1, sourceIdentity: SOURCE_B },
            ],
            outcomes: [
                { kind: "failed", sourceIndex: 0, sourceIdentity: SOURCE_B },
                { kind: "fetched", sourceIndex: 1, sourceIdentity: SOURCE_A, files: [template] },
            ],
            expected: [
                { kind: "remove", sourceIndex: 0, reason: "otherSource" },
                { kind: "remove", sourceIndex: 1, reason: "otherSource" },
                { kind: "replace", sourceIndex: 1, sourceIdentity: SOURCE_A, files: [template] },
            ],
        },
        {
            behaviour: "replaces, keeps and removes side by side",
            cachedSlots: [
                { sourceIndex: 0, sourceIdentity: SOURCE_A },
                { sourceIndex: 1, sourceIdentity: SOURCE_B },
                { sourceIndex: 2, sourceIdentity: SOURCE_C },
            ],
            outcomes: [
                { kind: "fetched", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
                { kind: "failed", sourceIndex: 1, sourceIdentity: SOURCE_B },
            ],
            expected: [
                { kind: "replace", sourceIndex: 0, sourceIdentity: SOURCE_A, files: [template] },
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
            text: '{"sourceIdentity":"source a","generation":3}',
            record: { sourceIdentity: SOURCE_A, generation: 3 },
        },
        {
            behaviour: "reads the time of the fetch",
            text: '{"sourceIdentity":"source a","generation":3,"fetchedAt":1700000000000}',
            record: { sourceIdentity: SOURCE_A, generation: 3, fetchedAt: 1_700_000_000_000 },
        },
        {
            behaviour: "reads what formatSourceSlotRecord wrote",
            text: formatSourceSlotRecord({
                sourceIdentity: SOURCE_B,
                generation: 12,
                fetchedAt: 1_700_000_000_000,
            }),
            record: { sourceIdentity: SOURCE_B, generation: 12, fetchedAt: 1_700_000_000_000 },
        },
        {
            behaviour: "ignores a time of the fetch that is no number",
            text: '{"sourceIdentity":"source a","generation":3,"fetchedAt":"yesterday"}',
            record: { sourceIdentity: SOURCE_A, generation: 3 },
        },
        {
            behaviour: "rejects a torn write",
            text: '{"sourceIdentity":"sour',
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
            text: '{"sourceIdentity":7,"generation":1}',
            record: undefined,
        },
        {
            behaviour: "rejects a record without a generation",
            text: '{"sourceIdentity":"source a"}',
            record: undefined,
        },
        {
            behaviour: "rejects a generation spelled as a string",
            text: '{"sourceIdentity":"source a","generation":"1"}',
            record: undefined,
        },
        {
            behaviour: "rejects a fractional generation",
            text: '{"sourceIdentity":"source a","generation":1.5}',
            record: undefined,
        },
    ])("$behaviour", ({ text, record }) => {
        expect(parseSourceSlotRecord(text)).toEqual(record);
    });
});

describe("formatSourceSlotRecord", () => {
    it("writes only the source, the generation and the time of the fetch", () => {
        const recordWithExtras = {
            sourceIdentity: SOURCE_A,
            generation: 2,
            fetchedAt: 1_700_000_000_000,
            files: ["a.json"],
        };

        expect(JSON.parse(formatSourceSlotRecord(recordWithExtras))).toEqual({
            sourceIdentity: SOURCE_A,
            generation: 2,
            fetchedAt: 1_700_000_000_000,
        });
    });
});

describe("nextSourceSlotRecord", () => {
    it.each<{
        behaviour: string;
        current: SourceSlotRecord | undefined;
        sourceIdentity: string;
        next: SourceSlotRecord;
    }>([
        {
            behaviour: "starts a slot without a record at generation 1",
            current: undefined,
            sourceIdentity: SOURCE_A,
            next: { sourceIdentity: SOURCE_A, generation: 1, fetchedAt: FETCHED_AT },
        },
        {
            behaviour: "moves a slot to the generation after its live one",
            current: { sourceIdentity: SOURCE_A, generation: 4 },
            sourceIdentity: SOURCE_A,
            next: { sourceIdentity: SOURCE_A, generation: 5, fetchedAt: FETCHED_AT },
        },
        {
            behaviour: "records the source that now fills the slot",
            current: { sourceIdentity: SOURCE_B, generation: 1 },
            sourceIdentity: SOURCE_A,
            next: { sourceIdentity: SOURCE_A, generation: 2, fetchedAt: FETCHED_AT },
        },
    ])("$behaviour", ({ current, sourceIdentity, next }) => {
        expect(nextSourceSlotRecord(current, sourceIdentity, FETCHED_AT)).toEqual(next);
    });
});
