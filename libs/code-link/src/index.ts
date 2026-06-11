/**
 * bpmn-js DI module that adds a "Go to implementation" entry to the context
 * pad around service / send / business-rule tasks carrying a Camunda
 * implementation reference (C7 `camunda:class` / delegate / expression /
 * external topic, or C8 `zeebe:taskDefinition` job type).
 *
 * Register as an `additionalModule` when creating the bpmn-js modeler:
 *
 * ```ts
 * import { CodeLinkModule } from "@miragon/bpmn-modeler-code-link";
 *
 * new BpmnModeler({ additionalModules: [CodeLinkModule] });
 * ```
 *
 * Requires a `vsCodeBridge` DI value with a `postMessage` method (the
 * bpmn-webview provides this so the existing single VS Code API instance is
 * reused).
 *
 * The module also registers a {@link CodeLinkMapClient}: it keeps the host's
 * activity→code map in sync (so the context-pad entry can hide when a task's
 * implementation does not exist) and is the service the bpmn-webview hands the
 * host's {@link ImplementationStatusQuery} pushes via `applyStatus`.
 */
import { CodeLinkContextPadProvider } from "./CodeLinkContextPadProvider";
import { CodeLinkMapClient } from "./CodeLinkMapClient";

export { extractImplementation } from "./extractImplementation";
export type { ImplementationKind, ImplementationReference } from "./extractImplementation";
export { collectImplementations, IMPLEMENTABLE_TYPES } from "./collectImplementations";
export { CodeLinkMapClient } from "./CodeLinkMapClient";

export const CodeLinkModule = {
    // `codeLinkMapClient` is listed first so it is constructed (and subscribed
    // to import/edit events) before the provider that depends on it.
    __init__: ["codeLinkMapClient", "codeLinkContextPadProvider"],
    codeLinkMapClient: ["type", CodeLinkMapClient],
    codeLinkContextPadProvider: ["type", CodeLinkContextPadProvider],
};
