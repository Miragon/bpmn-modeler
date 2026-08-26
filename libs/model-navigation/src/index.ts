/**
 * bpmn-js DI module that adds a "Navigate to referenced model" entry to the
 * context pad around Call Activities (BPMN→BPMN) and Business Rule Tasks
 * (BPMN→DMN).
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
import { NavigateContextPadProvider } from "./NavigateContextPadProvider";
import type { ModelNavigationPort } from "./ModelNavigationPort";

export { extractReference } from "./extractReference";
export type { ReferenceKind } from "./extractReference";
export type { ModelNavigationPort, ModelReference } from "./ModelNavigationPort";

/**
 * Builds the DI bundle for the given host port. The port rides along as a
 * `value` so the provider's `["contextPad", "translate", "modelNavigationPort"]`
 * injection resolves.
 */
export function createModelNavigationModule(port: ModelNavigationPort) {
    return {
        __init__: ["navigateContextPadProvider"],
        navigateContextPadProvider: ["type", NavigateContextPadProvider],
        modelNavigationPort: ["value", port],
    };
}
