import { Injector, type ModuleDeclaration } from "didi";
import { describe, expect, it } from "vitest";

import { C7_POPUP_MENU_ANNOTATIONS } from "../../../engines/domain/popupMenuAnnotationOverrides";
import { BASE_POPUP_MENU_ANNOTATIONS } from "../../domain/baseAnnotations";
import { popupMenuAnnotations } from "./popupMenuAnnotationsModule";

function annotationsOn(extra: ModuleDeclaration[]): unknown {
    const [module] = popupMenuAnnotations().modules as ModuleDeclaration[];
    return new Injector([...extra, module!]).get("popupMenuAnnotations");
}

describe("popupMenuAnnotations", () => {
    it("applies the overrides an engine feature registers", () => {
        expect(
            annotationsOn([{ popupMenuAnnotationOverrides: ["value", C7_POPUP_MENU_ANNOTATIONS] }]),
        ).toEqual(BASE_POPUP_MENU_ANNOTATIONS.withOverrides(C7_POPUP_MENU_ANNOTATIONS));
    });

    it("keeps the engine-neutral annotations without an engine feature", () => {
        expect(annotationsOn([])).toEqual(BASE_POPUP_MENU_ANNOTATIONS.withOverrides({}));
    });
});
