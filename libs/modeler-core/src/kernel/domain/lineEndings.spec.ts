import { describe, expect, it } from "vitest";

import { normalizeLineEndings } from "./lineEndings";

describe("normalizeLineEndings", () => {
    it.each([
        { behaviour: "keeps LF line endings", content: "a\nb\n", normalized: "a\nb\n" },
        { behaviour: "reads CRLF as LF", content: "a\r\nb\r\n", normalized: "a\nb\n" },
        { behaviour: "reads a lone CR as LF", content: "a\rb\r", normalized: "a\nb\n" },
        {
            behaviour: "reads mixed line endings as LF",
            content: "a\r\nb\rc\nd",
            normalized: "a\nb\nc\nd",
        },
        {
            behaviour: "reads a CR before a CRLF as its own line ending",
            content: "a\r\r\nb",
            normalized: "a\n\nb",
        },
        { behaviour: "reads an LF before a CR as two", content: "a\n\rb", normalized: "a\n\nb" },
        { behaviour: "keeps content without line endings", content: "<a/>", normalized: "<a/>" },
    ])("$behaviour", ({ content, normalized }) => {
        expect(normalizeLineEndings(content)).toBe(normalized);
    });
});
