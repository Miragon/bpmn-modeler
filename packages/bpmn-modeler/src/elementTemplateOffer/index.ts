import { ElementTemplateOffer } from "./ElementTemplateOffer";
import { HiddenTemplatePopupFilter } from "./HiddenTemplatePopupFilter";

/** Keeps hidden element templates out of new choices; registered on the modeler only. */
export const ElementTemplateOfferModule = {
    __init__: ["elementTemplateOffer", "hiddenTemplatePopupFilter"],
    elementTemplateOffer: ["type", ElementTemplateOffer],
    hiddenTemplatePopupFilter: ["type", HiddenTemplatePopupFilter],
};
