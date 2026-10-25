import { BASE_POPUP_MENU_ANNOTATIONS } from "./baseAnnotations";
import { PopupMenuAnnotationProvider } from "./PopupMenuAnnotationProvider";
import type { PopupMenuAnnotationOverrides } from "./popupMenuAnnotations";
import { ReplaceTemplatesTabProvider } from "./ReplaceTemplatesTabProvider";

export { BPMN_TAB } from "./ReplaceTemplatesTabProvider";
export type { PopupMenuAnnotationOverrides } from "./popupMenuAnnotations";

export function createPopupMenuAnnotationsModule(
    engineOverrides: PopupMenuAnnotationOverrides = {},
) {
    return {
        __init__: ["popupMenuAnnotationProvider"],
        popupMenuAnnotations: ["value", BASE_POPUP_MENU_ANNOTATIONS.withOverrides(engineOverrides)],
        popupMenuAnnotationProvider: ["type", PopupMenuAnnotationProvider],
    };
}

export const ReplaceTemplatesTabModule = {
    __init__: ["replaceTemplatesTabProvider"],
    replaceTemplatesTabProvider: ["type", ReplaceTemplatesTabProvider],
};
