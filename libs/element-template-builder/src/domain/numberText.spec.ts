import { describe, expect, it } from "vitest";

import { normalizedNumberText, readNumberText } from "./numberText";

describe("readNumberText", () => {
    it.each([
        ["", { kind: "empty" }],
        ["   ", { kind: "empty" }],
        ["1", { kind: "number", value: 1 }],
        [" 1.5 ", { kind: "number", value: 1.5 }],
        ["1.", { kind: "number", value: 1 }],
        ["-2", { kind: "number", value: -2 }],
        ["1e3", { kind: "number", value: 1000 }],
        ["abc", { kind: "invalid" }],
        ["1e", { kind: "invalid" }],
        ["-", { kind: "invalid" }],
        ["Infinity", { kind: "invalid" }],
        ["1e999", { kind: "invalid" }],
    ])("reads %j", (text, expected) => {
        expect(readNumberText(text)).toEqual(expected);
    });
});

describe("normalizedNumberText", () => {
    it.each([
        ["", ""],
        [" ", ""],
        ["1.", "1"],
        ["1.50", "1.5"],
        ["01", "1"],
        ["abc", "abc"],
    ])("turns %j into %j", (text, expected) => {
        expect(normalizedNumberText(text)).toBe(expected);
    });
});
