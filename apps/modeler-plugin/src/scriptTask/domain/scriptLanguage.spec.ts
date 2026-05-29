import { describe, expect, it } from "vitest";

import { ScriptLanguage } from "./scriptLanguage";

describe("ScriptLanguage", () => {
    describe("known formats", () => {
        it.each([
            ["javascript", "javascript", "js"],
            ["groovy", "groovy", "groovy"],
            ["python", "python", "py"],
            ["ruby", "ruby", "rb"],
        ])("maps %s to its languageId and extension", (format, languageId, extension) => {
            const language = new ScriptLanguage(format);

            expect(language.languageId).toBe(languageId);
            expect(language.extension).toBe(extension);
        });

        // Camunda models carry the format verbatim, so casing/whitespace varies;
        // normalize() at scriptLanguage.ts:62 must canonicalize before lookup.
        it("normalizes mixed case and surrounding whitespace", () => {
            const language = new ScriptLanguage("  Groovy ");

            expect(language.languageId).toBe("groovy");
            expect(language.extension).toBe("groovy");
        });
    });

    describe("unknown formats", () => {
        it("falls back to plaintext/txt", () => {
            const language = new ScriptLanguage("brainfuck");

            expect(language.languageId).toBe("plaintext");
            expect(language.extension).toBe("txt");
        });

        it("reports the fallback as unsupported", () => {
            expect(ScriptLanguage.isSupported("brainfuck")).toBe(false);
        });
    });

    describe("isSupported", () => {
        it("is true for a known format", () => {
            expect(ScriptLanguage.isSupported("python")).toBe(true);
        });

        it("is true for a denormalized known format", () => {
            expect(ScriptLanguage.isSupported("  JavaScript ")).toBe(true);
        });
    });

    describe("supportedFormats", () => {
        it("returns the canonical list in declared order", () => {
            expect(ScriptLanguage.supportedFormats()).toEqual([
                "javascript",
                "groovy",
                "python",
                "ruby",
            ]);
        });
    });
});
