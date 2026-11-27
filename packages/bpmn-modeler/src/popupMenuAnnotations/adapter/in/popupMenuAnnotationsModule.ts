import type { BpmnFeature } from "../../../kernel/domain/bpmnFeature";
import {
    POPUP_MENU_ANNOTATION_OVERRIDES,
    type PopupMenuAnnotationOverrides,
} from "../../../kernel/domain/popupMenus";
import { BASE_POPUP_MENU_ANNOTATIONS } from "../../domain/baseAnnotations";
import type { PopupMenuAnnotations } from "../../domain/popupMenuAnnotations";
import { PopupMenuAnnotationProvider } from "./PopupMenuAnnotationProvider";

interface OverridesInjector {
    get<T>(name: string, strict: false): T | null;
}

export function createPopupMenuAnnotationsModule(
    engineOverrides: PopupMenuAnnotationOverrides = {},
) {
    return {
        __init__: ["popupMenuAnnotationProvider"],
        popupMenuAnnotations: ["value", BASE_POPUP_MENU_ANNOTATIONS.withOverrides(engineOverrides)],
        popupMenuAnnotationProvider: ["type", PopupMenuAnnotationProvider],
    };
}

function popupMenuAnnotationsFactory(injector: OverridesInjector): PopupMenuAnnotations {
    return BASE_POPUP_MENU_ANNOTATIONS.withOverrides(
        injector.get<PopupMenuAnnotationOverrides>(POPUP_MENU_ANNOTATION_OVERRIDES, false) ?? {},
    );
}
popupMenuAnnotationsFactory.$inject = ["injector"];

/**
 * @experimental Descriptions and search keywords on the popup-menu entries,
 * with the overrides an engine feature registers.
 */
export function popupMenuAnnotations(): BpmnFeature {
    return {
        id: "popupMenuAnnotations",
        modules: [
            {
                __init__: ["popupMenuAnnotationProvider"],
                popupMenuAnnotations: ["factory", popupMenuAnnotationsFactory],
                popupMenuAnnotationProvider: ["type", PopupMenuAnnotationProvider],
            },
        ],
    };
}
