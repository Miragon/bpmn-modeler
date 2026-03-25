/**
 * bpmn-js DI module that replaces the default popup menu for the
 * `bpmn-js-create-append-anything` plugin with a custom two-panel overlay.
 *
 * The left panel shows a searchable, filterable list of element templates.
 * The right panel shows standard BPMN elements organised by category.
 *
 * Register as an `additionalModule` when creating the bpmn-js modeler:
 * ```ts
 * import { AppendMenuModule } from "@bpmn-modeler/append-menu";
 *
 * new BpmnModeler({ additionalModules: [AppendMenuModule] });
 * ```
 */
import { AppendMenuOverride } from "./AppendMenuOverride";
import "./append-menu.css";

export const AppendMenuModule = {
    __init__: ["appendMenuOverride"],
    appendMenuOverride: ["type", AppendMenuOverride],
};
