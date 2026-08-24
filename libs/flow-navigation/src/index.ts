/**
 * bpmn-js DI module that adds Tab / Shift+Tab / Enter keyboard navigation
 * along sequence flows to the BPMN modeler.
 *
 * Register as an `additionalModule` when creating the bpmn-js modeler:
 * ```ts
 * import { FlowNavigationModule } from "@miragon/bpmn-modeler-flow-navigation";
 *
 * new BpmnModeler({ additionalModules: [FlowNavigationModule] });
 * ```
 */
import { ContextPadKeyboard } from "./ContextPadKeyboard";
import { DeleteSelectionBehavior } from "./DeleteSelectionBehavior";
import { FlowNavigation } from "./FlowNavigation";

export const FlowNavigationModule = {
    __init__: ["flowNavigation", "deleteSelectionBehavior", "contextPadKeyboard"],
    flowNavigation: ["type", FlowNavigation],
    deleteSelectionBehavior: ["type", DeleteSelectionBehavior],
    contextPadKeyboard: ["type", ContextPadKeyboard],
};
