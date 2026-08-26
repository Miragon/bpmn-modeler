/**
 * bpmn-js DI module that adds a "Go to implementation" entry to the context
 * pad around service / send / business-rule tasks carrying a Camunda
 * implementation reference (C7 `camunda:class` / delegate / expression /
 * external topic, or C8 `zeebe:taskDefinition` job type).
 *
 * The module is built by {@link createCodeLinkModule}, which takes the
 * {@link CodeLinkPort} and embeds it as the `codeLinkPort` DI value.
 * Registering the providers without their port is therefore unrepresentable —
 * a host-less consumer that omits the port gets no UI.
 *
 * ```ts
 * import { createCodeLinkModule } from "@miragon/bpmn-modeler-code-link";
 *
 * new BpmnModeler({ additionalModules: [createCodeLinkModule(port)] });
 * ```
 *
 * The module also registers a {@link CodeLinkMapClient}: it keeps the host's
 * activity→code map in sync (so the context-pad entry can hide when a task's
 * implementation does not exist) and is the service the bpmn-webview hands the
 * host's status pushes via `applyStatus`.
 */
import { CodeLinkContextPadProvider } from "./CodeLinkContextPadProvider";
import { CodeLinkMapClient } from "./CodeLinkMapClient";
import type { CodeLinkPort } from "./CodeLinkPort";

export { extractImplementation } from "./extractImplementation";
export type { ImplementationKind, ImplementationReference } from "./extractImplementation";
export { collectImplementations, IMPLEMENTABLE_TYPES } from "./collectImplementations";
export { CodeLinkMapClient } from "./CodeLinkMapClient";
export type { CodeLinkPort } from "./CodeLinkPort";

/**
 * Builds the DI bundle for the given host port. `codeLinkMapClient` is listed
 * first in `__init__` so it is constructed (and subscribed to import/edit
 * events) before the provider that depends on it; the port rides along as a
 * `value` so both `codeLinkPort` injections resolve.
 */
export function createCodeLinkModule(port: CodeLinkPort) {
    return {
        __init__: ["codeLinkMapClient", "codeLinkContextPadProvider"],
        codeLinkMapClient: ["type", CodeLinkMapClient],
        codeLinkContextPadProvider: ["type", CodeLinkContextPadProvider],
        codeLinkPort: ["value", port],
    };
}
