import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { parseSource } from "./parseSource";

describe("parseSource", () => {
    it.each([
        { reread: "the same file", fileName: "a.ts" },
        { reread: "the same text under another name", fileName: "dir/b.ts" },
    ])("parses $reread once", ({ fileName }) => {
        const text = "export const once = 1;";

        expect(parseSource(fileName, text)).toBe(parseSource("a.ts", text));
    });

    it("parses a changed text again", () => {
        parseSource("a.ts", "export const before = 1;");

        expect(parseSource("a.ts", "export const after = 2;").text).toBe("export const after = 2;");
    });

    it("parses a text read as TypeScript again as JSX under a .tsx name", () => {
        const text = "export const view = 1;";
        parseSource("view.ts", text);

        expect(parseSource("view.tsx", text).languageVariant).toBe(ts.LanguageVariant.JSX);
    });
});
