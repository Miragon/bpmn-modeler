import { describe, expect, it } from "vitest";

import { minimalReplacement } from "./textReplacement";

describe("minimalReplacement", () => {
    it("finds nothing to replace in identical texts", () => {
        expect(minimalReplacement('{"a":1}', '{"a":1}')).toBeUndefined();
    });

    it.each([
        ["a changed value", '{"name":"Old"}', '{"name":"New"}', { start: 9, end: 12, text: "New" }],
        ["an insertion", "abc", "abXc", { start: 2, end: 2, text: "X" }],
        ["a deletion", "abXc", "abc", { start: 2, end: 3, text: "" }],
        ["an append", "abc", "abcd", { start: 3, end: 3, text: "d" }],
        ["a whole new text", "abc", "xyz", { start: 0, end: 3, text: "xyz" }],
        ["an emptied text", "abc", "", { start: 0, end: 3, text: "" }],
        ["a repeated character", "aaa", "aaaa", { start: 3, end: 3, text: "a" }],
    ])("replaces only %s", (_, oldText, newText, replacement) => {
        expect(minimalReplacement(oldText, newText)).toEqual(replacement);
    });

    it.each([
        ["an inserted carriage return", "a\r\nb", "a\r\r\nb", { start: 1, end: 1, text: "\r" }],
        ["a changed line break", "a\r\nb", "a\nb", { start: 1, end: 3, text: "\n" }],
        ["a changed emoji", "a😀b", "a😁b", { start: 1, end: 3, text: "😁" }],
        ["an emoji after the same high surrogate", "😀", "😀😁", { start: 2, end: 2, text: "😁" }],
    ])("keeps %s whole", (_, oldText, newText, replacement) => {
        const result = minimalReplacement(oldText, newText);

        expect(result).toEqual(replacement);
        expect(oldText.slice(0, result!.start) + result!.text + oldText.slice(result!.end)).toBe(
            newText,
        );
    });

    it("never splits a line break or surrogate pair at either end", () => {
        const texts = ["\r\n", "a\r\nb", "😀", "x😀y", "\r\n😀\r\n", "ab", ""];
        for (const oldText of texts) {
            for (const newText of texts) {
                const result = minimalReplacement(oldText, newText);
                if (!result) {
                    expect(oldText).toBe(newText);
                    continue;
                }
                const { start, end, text } = result;
                expect(oldText.slice(0, start) + text + oldText.slice(end)).toBe(newText);
                for (const boundary of [start, end]) {
                    expect(splitsPair(oldText, boundary)).toBe(false);
                }
            }
        }
    });
});

function splitsPair(text: string, index: number): boolean {
    const before = text.charCodeAt(index - 1);
    const after = text.charCodeAt(index);
    const crlf = text[index - 1] === "\r" && text[index] === "\n";
    const surrogate = before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
    return crlf || surrogate;
}
