import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { HARVEST_FILES, harvestRecord } from "./harvestRecord";

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

// The browser drains' records are pasted by hand, so this also catches a drain that stops sorting or deduplicating.
describe("every recorded harvest", () => {
    it.each(HARVEST_FILES)("%s is written as harvestRecord writes it", (file) => {
        const text = readFileSync(new URL(`../tools/${file}`, import.meta.url), "utf8");
        const { note, keys } = JSON.parse(text) as { note: string; keys: string[] };

        expect(harvestRecord(note, keys)).toBe(text);
    });
});
