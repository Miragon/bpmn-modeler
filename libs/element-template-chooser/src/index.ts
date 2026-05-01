/**
 * bpmn-js DI module that provides a modern element template chooser overlay.
 *
 * Replaces `@bpmn-io/element-template-chooser` with a Preact-based UI
 * offering search, category filtering, and a property preview panel.
 *
 * Register as an `additionalModule` when creating the bpmn-js modeler:
 * ```ts
 * import { ElementTemplateChooserModule } from "@miragon/bpmn-modeler-element-template-chooser";
 *
 * new BpmnModeler({ additionalModules: [ElementTemplateChooserModule] });
 * ```
 */
import { ElementTemplateChooser } from "./ElementTemplateChooser";
import "./chooser.css";

export const ElementTemplateChooserModule = {
    __init__: ["elementTemplateChooser"],
    elementTemplateChooser: ["type", ElementTemplateChooser],
};

export type { ElementTemplate, TemplateProperty } from "./types";
