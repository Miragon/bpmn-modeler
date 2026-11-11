import { describe, expect, it } from "vitest";
import { modelerLanguagePrompt } from "./modelerLanguagePrompt";

describe("modelerLanguagePrompt", () => {
    it.each([
        {
            name: "keeps catalogue labels and order with locale descriptions and values",
            languages: [
                { label: "Deutsch", locale: "de" },
                { label: "English", locale: "en" },
            ],
            items: [
                { label: "Deutsch", description: "de", value: "de" },
                { label: "English", description: "en", value: "en" },
            ],
        },
        { name: "does not invent choices outside the catalogue", languages: [], items: [] },
    ])("$name", ({ languages, items }) => {
        expect(modelerLanguagePrompt(languages)).toEqual({
            id: "modelerLanguage",
            title: "Change Modeler Language",
            placeholder: "Select the modeler UI language",
            items,
        });
    });
});
