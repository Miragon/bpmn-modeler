import { describe, expect, it } from "vitest";

import { ScriptLanguage, scriptLanguagePrompt } from "./scriptLanguage";

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

        // Camunda models carry the format verbatim, so casing and whitespace
        // vary and the lookup must canonicalize them first.
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

    describe("fromExtension", () => {
        it.each([
            ["js", "javascript"],
            ["groovy", "groovy"],
            ["py", "python"],
            ["rb", "ruby"],
        ])("maps the %s extension back to its language", (extension, languageId) => {
            const language = ScriptLanguage.fromExtension(extension);
            expect(language?.languageId).toBe(languageId);
            expect(language?.extension).toBe(extension);
        });

        it("normalizes case and whitespace before matching", () => {
            expect(ScriptLanguage.fromExtension("  GROOVY ")?.languageId).toBe("groovy");
        });

        // `ts`/`json` back the ambient files (`camunda.d.ts`, `jsconfig.json`);
        // they must not resolve, so adoption skips them rather than tracking them.
        it.each(["ts", "json", "txt", "", "javascript"])(
            "returns undefined for the non-language extension %o",
            (extension) => {
                expect(ScriptLanguage.fromExtension(extension)).toBeUndefined();
            },
        );
    });
});

describe("scriptLanguagePrompt", () => {
    const JAVASCRIPT = { label: "Javascript", description: ".js", value: "javascript" };
    const GROOVY = { label: "Groovy", description: ".groovy", value: "groovy" };
    const PYTHON = { label: "Python", description: ".py", value: "python" };
    const RUBY = { label: "Ruby", description: ".rb", value: "ruby" };

    it.each([
        {
            script: "a missing format",
            currentFormat: "",
            items: [JAVASCRIPT, GROOVY, PYTHON, RUBY],
        },
        {
            script: "an unsupported format",
            currentFormat: "cobol",
            items: [JAVASCRIPT, GROOVY, PYTHON, RUBY],
        },
        {
            script: "the format groovy",
            currentFormat: "groovy",
            items: [GROOVY, JAVASCRIPT, PYTHON, RUBY],
        },
        {
            script: "the last supported format",
            currentFormat: "ruby",
            items: [RUBY, JAVASCRIPT, GROOVY, PYTHON],
        },
        {
            script: "a supported format in other casing and spacing",
            currentFormat: " Groovy ",
            items: [GROOVY, JAVASCRIPT, PYTHON, RUBY],
        },
    ])(
        "offers every supported language, the current one first, for $script",
        ({ currentFormat, items }) => {
            expect(scriptLanguagePrompt(currentFormat)).toEqual({
                id: "scriptLanguage",
                title: "Script Language",
                placeholder: "Select the scripting language",
                items,
            });
        },
    );
});
