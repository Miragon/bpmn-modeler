/**
 * bpmn-js DI module that replaces the default popup menu for the
 * `bpmn-js-create-append-anything` plugin with a custom two-panel overlay.
 *
 * The left panel shows a searchable, filterable list of element templates.
 * The right panel shows standard BPMN elements organised by category.
 *
 * Register as an `additionalModule` when creating the bpmn-js modeler:
 * ```ts
 * import { AppendMenuModule } from "@miragon/bpmn-modeler-append-menu";
 *
 * new BpmnModeler({ additionalModules: [AppendMenuModule] });
 * ```
 */
import { AppendMenuOverride } from "./AppendMenuOverride";
import "./append-menu.css";

export const AppendMenuModule = {
    __init__: ["appendMenuOverride"],
    appendMenuOverride: ["type", AppendMenuOverride],
    // camunda-bpmn-js ≥5.33 adds popup-menu providers that regroup
    // bpmn-append/bpmn-create into a drill-in category tree (and, on C8, tab
    // metadata) the custom overlay can't consume. Redefining the provider DI
    // names as inert values keeps those providers from ever constructing, so
    // they never register — restoring the flat entry stream the overlay reads.
    // bpmn-replace is left untouched (its default menu is not intercepted).
    createGroupsProvider: ["value", null],
    appendGroupsProvider: ["value", null],
    createTabsProvider: ["value", null],
    appendTabsProvider: ["value", null],
};
