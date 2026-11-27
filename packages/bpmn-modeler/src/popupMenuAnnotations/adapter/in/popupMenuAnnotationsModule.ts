import { BASE_POPUP_MENU_ANNOTATIONS } from "../../domain/baseAnnotations";
import { PopupMenuAnnotationProvider } from "./PopupMenuAnnotationProvider";
import type { PopupMenuAnnotationOverrides } from "../../../kernel/domain/popupMenus";


export function createPopupMenuAnnotationsModule(
    engineOverrides: PopupMenuAnnotationOverrides = {},
) {
    return {
        __init__: ["popupMenuAnnotationProvider"],
        popupMenuAnnotations: ["value", BASE_POPUP_MENU_ANNOTATIONS.withOverrides(engineOverrides)],
        popupMenuAnnotationProvider: ["type", PopupMenuAnnotationProvider],
    };
}
