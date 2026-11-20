import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { harvestRecordPath } from "./harvestedKeys";
import {
    HARVEST_FILES,
    harvestRecord,
    isHarvestFile,
    parseDrainedKeys,
    parseHarvestRecord,
} from "./harvestRecord";

describe("harvestRecord", () => {
    it("writes the keys once each, sorted and counted, indented by four spaces and ending in a newline", () => {
        expect(harvestRecord("a note", ["b", "a", "b", "B"])).toBe(
            [
                "{",
                '    "note": "a note",',
                '    "count": 3,',
                '    "keys": [',
                '        "B",',
                '        "a",',
                '        "b"',
                "    ]",
                "}",
                "",
            ].join("\n"),
        );
    });

    it("writes an empty harvest with a count of zero", () => {
        expect(JSON.parse(harvestRecord("a note", []))).toStrictEqual({
            note: "a note",
            count: 0,
            keys: [],
        });
    });
});

describe("parseHarvestRecord", () => {
    it("reads back the note and the keys harvestRecord wrote", () => {
        expect(parseHarvestRecord(harvestRecord("a note", ["b", "a"]))).toStrictEqual({
            note: "a note",
            keys: ["a", "b"],
        });
    });
});

describe("parseDrainedKeys", () => {
    it("reads the key list a browser drain leaves", () => {
        expect(parseDrainedKeys('["b", "a"]')).toStrictEqual(["b", "a"]);
    });

    it.each(['"a"', '{ "keys": ["a"] }', '["a", 1]'])(
        "refuses %s, which is no list of keys",
        (text) => {
            expect(() => parseDrainedKeys(text)).toThrow("a JSON array of strings");
        },
    );
});

describe("isHarvestFile", () => {
    it("knows every record readHarvestedKeys reads and no other file", () => {
        expect(HARVEST_FILES.every(isHarvestFile)).toBe(true);
        expect(isHarvestFile("harvested-unknown.json")).toBe(false);
    });
});

describe("harvestRecordPath", () => {
    it("names the record in the tools folder beside src", () => {
        expect(harvestRecordPath("harvested.json")).toBe(
            fileURLToPath(new URL("../tools/harvested.json", import.meta.url)),
        );
    });
});

// The browser drains' records are pasted by hand, so this also catches a drain that stops sorting or deduplicating.
describe("every recorded harvest", () => {
    it.each(HARVEST_FILES)("%s is written as harvestRecord writes it", (file) => {
        const text = readFileSync(harvestRecordPath(file), "utf8");
        const { note, keys } = parseHarvestRecord(text);

        expect(harvestRecord(note, keys)).toBe(text);
    });
});
