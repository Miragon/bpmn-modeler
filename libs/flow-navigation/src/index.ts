/**
 * bpmn-js DI module that adds Tab / Shift+Tab / Enter / u / g keyboard
 * navigation along sequence flows, into/out of collapsed subprocesses,
 * and to linked files (referenced models or implementations).
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
import { LinkNavigation } from "./LinkNavigation";
import { PlaneNavigation } from "./PlaneNavigation";

export const FlowNavigationModule = {
    __init__: [
        "flowNavigation",
        "deleteSelectionBehavior",
        "contextPadKeyboard",
        "planeNavigation",
        "linkNavigation",
    ],
    flowNavigation: ["type", FlowNavigation],
    deleteSelectionBehavior: ["type", DeleteSelectionBehavior],
    contextPadKeyboard: ["type", ContextPadKeyboard],
    planeNavigation: ["type", PlaneNavigation],
    linkNavigation: ["type", LinkNavigation],
};
