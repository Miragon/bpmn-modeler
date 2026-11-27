import { ElementTemplateEngineRefresh } from "./ElementTemplateEngineRefresh";
import { ElementTemplateOffer } from "./ElementTemplateOffer";
import { HiddenTemplatePopupFilter } from "./HiddenTemplatePopupFilter";
import { ReplaceTemplatesTabProvider } from "./ReplaceTemplatesTabProvider";

export type { ElementTemplateOffer };
export { BPMN_TAB } from "./ReplaceTemplatesTabProvider";
export { PopupMenuModeFilter, PopupMenuModeFilterModule } from "./PopupMenuModeFilter";

/** Keeps hidden element templates out of new choices; registered on the modeler only. */
export const ElementTemplateOfferModule = {
    __init__: ["elementTemplateOffer", "hiddenTemplatePopupFilter"],
    elementTemplateOffer: ["type", ElementTemplateOffer],
    hiddenTemplatePopupFilter: ["type", HiddenTemplatePopupFilter],
};

/** Refreshes the templates' engine profile after each import; registered on the modeler only. */
export const ElementTemplateEngineRefreshModule = {
    __init__: ["elementTemplateEngineRefresh"],
    elementTemplateEngineRefresh: ["type", ElementTemplateEngineRefresh],
};

/** Moves the replace menu's template entries into a Templates tab. */
export const ReplaceTemplatesTabModule = {
    __init__: ["replaceTemplatesTabProvider"],
    replaceTemplatesTabProvider: ["type", ReplaceTemplatesTabProvider],
};
