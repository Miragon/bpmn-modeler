/**
 * bpmn-js DI module that provides a modern element template chooser overlay.
 *
 * Replaces `@bpmn-io/element-template-chooser` with a Preact-based UI
 * offering search, category filtering, and a property preview panel.
 */
import { ElementTemplateChooser } from "./ElementTemplateChooser";
import "./chooser.css";

export const ElementTemplateChooserModule = {
    __init__: ["elementTemplateChooser"],
    elementTemplateChooser: ["type", ElementTemplateChooser],
};

export type {
    ElementTemplate,
    TemplateStep,
    TemplatePreset,
    TemplateProperty,
    ImplementationDetail,
    BindingDirection,
} from "./types";
export { classifyBinding, extractImplementationDetail } from "./types";
export type { TemplateOffer } from "./ElementTemplateChooser";
