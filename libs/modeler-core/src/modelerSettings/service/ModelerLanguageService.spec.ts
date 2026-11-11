import { describe, expect, it, vi } from "vitest";
import { createTestHost } from "../../testing";
import { ModelerLanguageService } from "./ModelerLanguageService";

function setup(answer?: string) {
    const host = createTestHost({ promptAnswers: { modelerLanguage: answer } });
    const saved: string[] = [];
    const preference = {
        setLanguage: async (locale: string) => {
            saved.push(locale);
        },
    };
    const service = new ModelerLanguageService(host.picker, preference, host.notifier);
    return { host, saved, preference, service };
}

describe("ModelerLanguageService", () => {
    it("offers the complete shipped catalogue without requiring an editor", async () => {
        const { host, service } = setup();
        await service.changeLanguage();
        expect(host.picker.prompts[0]?.args[0]).toEqual({
            id: "modelerLanguage",
            title: "Change Modeler Language",
            placeholder: "Select the modeler UI language",
            items: [
                ["Deutsch", "de"],
                ["English", "en"],
                ["Español", "es"],
                ["Français", "fr"],
                ["Italiano", "it"],
                ["Português (Brasil)", "pt-br"],
                ["简体中文", "zh-Hans"],
                ["繁体中文", "zh-Hant"],
                ["Русский", "ru"],
                ["Nederlands (Netherlands)", "nl-nl"],
                ["日本語", "ja"],
                ["한국어", "ko"],
            ].map(([label, locale]) => ({ label, description: locale, value: locale })),
        });
    });
    it("dismisses without storing or logging", async () => {
        const { service, saved, host } = setup();
        await service.changeLanguage();
        expect(saved).toEqual([]);
        expect(host.notifier.logged("info")).toEqual([]);
    });
    it("waits for persistence before logging the new language", async () => {
        const { service, preference, host } = setup("de");
        let finish!: () => void;
        const pending = new Promise<void>((resolve) => {
            finish = resolve;
        });
        const writes: string[] = [];
        vi.spyOn(preference, "setLanguage").mockImplementation(async (locale) => {
            writes.push(locale);
            await pending;
        });
        const changing = service.changeLanguage();
        await Promise.resolve();
        expect(writes).toEqual(["de"]);
        expect(host.notifier.logged("info")).toEqual([]);
        finish();
        await changing;
        expect(host.notifier.logged("info")).toEqual(["Modeler language changed to de"]);
    });
    it.each(["picker", "write"])(
        "propagates a %s failure without a success breadcrumb",
        async (source) => {
            const { service, preference, host, saved } = setup("en");
            const failure = new Error("denied");
            if (source === "picker") vi.spyOn(host.picker, "choose").mockRejectedValue(failure);
            else vi.spyOn(preference, "setLanguage").mockRejectedValue(failure);
            await expect(service.changeLanguage()).rejects.toThrow(failure);
            expect(saved).toEqual([]);
            expect(host.notifier.logged("info")).toEqual([]);
        },
    );
});
