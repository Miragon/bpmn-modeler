import { describe, expect, it, vi } from "vitest";
import { i18n as translations, TranslateModule } from "@miragon/bpmn-modeler-i18n";
import { extras } from "@miragon/bpmn-modeler-i18n-extras";

import { i18n } from "./i18nFeature";

describe("i18n", () => {
    it("adds the local translations when the list is built and registers the translator", () => {
        const extend = vi.spyOn(translations, "extend");

        expect(i18n()).toEqual({ id: "i18n", modules: [TranslateModule] });
        expect(extend).toHaveBeenCalledWith(extras);

        extend.mockRestore();
    });
});
