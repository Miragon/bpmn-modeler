import { ElementTemplateEngineRefresh } from "./ElementTemplateEngineRefresh";
import { ElementTemplateOffer } from "./ElementTemplateOffer";
import { HiddenTemplatePopupFilter } from "./HiddenTemplatePopupFilter";

export type { ElementTemplateOffer };

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
