/**
 * bpmn-js DI module that adds a "Navigate to referenced model" entry to the
 * context pad around Call Activities (BPMN→BPMN), Business Rule Tasks
 * (BPMN→DMN), and C8 User Tasks with a resolvable linked form (BPMN→form).
 *
 * The module is built by {@link createModelNavigationModule}, which takes the
 * {@link ModelNavigationPort} and embeds it as the `modelNavigationPort` DI
 * value. Registering the provider without its port is therefore
 * unrepresentable — a host-less consumer that omits the port gets no UI.
 *
 * ```ts
 * import { createModelNavigationModule } from "@miragon/bpmn-model-navigation";
 *
 * new BpmnModeler({
 *     additionalModules: [createModelNavigationModule({ openReference })],
 * });
 * ```
 */
import { FormReferenceStatusClient } from "./FormReferenceStatusClient";
import { NavigateContextPadProvider } from "./NavigateContextPadProvider";
import type { ModelNavigationPort } from "./ModelNavigationPort";

export { extractReference } from "./extractReference";
export type { ReferenceKind } from "./extractReference";
export { FormReferenceStatusClient };
export type { ModelNavigationPort, ModelReference } from "./ModelNavigationPort";

/**
 * Builds the DI bundle for the given host port. The port rides along as a
 * `value` so the provider's `["contextPad", "translate", "modelNavigationPort"]`
 * injection resolves.
 *
 * @internal Package-internal composition wiring: consumers enable this feature
 *   through the modeler's `capabilities.modelNavigation` port, not by calling
 *   this factory directly (#1375).
 */
export function createModelNavigationModule(port: ModelNavigationPort) {
    return {
        __init__: ["formReferenceStatusClient", "navigateContextPadProvider"],
        formReferenceStatusClient: ["type", FormReferenceStatusClient],
        navigateContextPadProvider: ["type", NavigateContextPadProvider],
        modelNavigationPort: ["value", port],
    };
}
