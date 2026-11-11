import {
    createPopupDraftInput,
    type PopupDraftInput,
    type PopupEventBus,
} from "@miragon/bpmn-modeler-types";

function popupDraftInputFactory(eventBus: PopupEventBus): PopupDraftInput {
    const popupDrafts = createPopupDraftInput();
    popupDrafts.track(eventBus);
    return popupDrafts;
}
popupDraftInputFactory.$inject = ["eventBus"];

/** Follows the panel's FEEL pop-up from the start, before any pop-up can open. */
export const PopupDraftInputModule = {
    __init__: ["popupDraftInput"],
    popupDraftInput: ["factory", popupDraftInputFactory],
};
