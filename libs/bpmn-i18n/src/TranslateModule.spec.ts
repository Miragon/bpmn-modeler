import { CustomTranslator } from "./TranslateModule";

describe("CustomTranslator", () => {
    let translator: CustomTranslator;

    beforeEach(() => {
        translator = new CustomTranslator();
    });

    describe("translate", () => {
        it("should return the original template when no translation exists", () => {
            const result = translator.translate("Some untranslated string");
            expect(result).toBe("Some untranslated string");
        });

        it("should return the English translation for a known key", () => {
            // English is the default locale, so keys map to themselves.
            const result = translator.translate("Append {type}");
            expect(result).toBe("Append {type}");
        });

        it("should replace {param} placeholders with provided values", () => {
            const result = translator.translate("Append {type}", { type: "Task" });
            expect(result).toBe("Append Task");
        });

        it("should preserve unreplaced placeholders when no replacement is provided", () => {
            const result = translator.translate("no parent for {element} in {parent}");
            expect(result).toBe("no parent for {element} in {parent}");
        });

        it("should replace multiple placeholders", () => {
            const result = translator.translate(
                "no parent for {element} in {parent}",
                { element: "Task_1", parent: "Process_1" },
            );
            expect(result).toBe("no parent for Task_1 in Process_1");
        });
    });

    describe("setLanguage", () => {
        it("should switch to German translations", () => {
            translator.setLanguage("de");
            const result = translator.translate("Activate hand tool");
            expect(result).toBe("Handwerkzeug aktivieren");
        });

        it("should switch to French translations", () => {
            translator.setLanguage("fr");
            const result = translator.translate("Remove");
            expect(result).toBe("Supprimer");
        });

        it("should replace placeholders in translated strings", () => {
            translator.setLanguage("de");
            const result = translator.translate("Append {type}", { type: "Aufgabe" });
            expect(result).toBe("Aufgabe anfügen");
        });

        it("should fall back to the original template for untranslated keys", () => {
            translator.setLanguage("de");
            const result = translator.translate("This key does not exist in any dictionary");
            expect(result).toBe("This key does not exist in any dictionary");
        });

        it("should switch back to English after switching to another language", () => {
            translator.setLanguage("de");
            expect(translator.translate("Remove")).toBe("Entfernen");

            translator.setLanguage("en");
            expect(translator.translate("Remove")).toBe("Remove");
        });
    });

    describe("getLocale", () => {
        it("should default to 'en'", () => {
            expect(translator.getLocale()).toBe("en");
        });

        it("should return the locale after setLanguage", () => {
            translator.setLanguage("zh-Hans");
            expect(translator.getLocale()).toBe("zh-Hans");
        });
    });
});
