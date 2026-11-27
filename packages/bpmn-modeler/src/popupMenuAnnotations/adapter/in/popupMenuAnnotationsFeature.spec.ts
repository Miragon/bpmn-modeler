import { Injector, type ModuleDeclaration } from "didi";
import { describe, expect, it } from "vitest";

import type { PopupMenuAnnotationOverrides } from "../../../kernel/domain/popupMenus";
import { BASE_POPUP_MENU_ANNOTATIONS } from "../../domain/baseAnnotations";
import { popupMenuAnnotations } from "./popupMenuAnnotationsModule";

function annotationsOn(extra: ModuleDeclaration[]): unknown {
    const [module] = popupMenuAnnotations().modules as ModuleDeclaration[];
    return new Injector([...extra, module!]).get("popupMenuAnnotations");
}

const OVERRIDES: PopupMenuAnnotationOverrides = {
    descriptions: { "service-task": "Work done by an engine" },
    additionalKeywords: { "service-task": ["Engine worker"] },
};

describe("popupMenuAnnotations", () => {
    it("applies the overrides an engine feature registers", () => {
        expect(annotationsOn([{ popupMenuAnnotationOverrides: ["value", OVERRIDES] }])).toEqual(
            BASE_POPUP_MENU_ANNOTATIONS.withOverrides(OVERRIDES),
        );
    });

    it("keeps the engine-neutral annotations without an engine feature", () => {
        expect(annotationsOn([])).toEqual(BASE_POPUP_MENU_ANNOTATIONS.withOverrides({}));
    });
});
