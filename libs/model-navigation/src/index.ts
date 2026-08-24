/**
 * bpmn-js DI module that adds a "Navigate to referenced model" entry to the
 * context pad around Call Activities (BPMN→BPMN), Business Rule Tasks
 * (BPMN→DMN), and C8 User Tasks with a resolvable linked form (BPMN→form).
 *
 * Register as an `additionalModule` when creating the bpmn-js modeler:
 *
 * ```ts
 * import { NavigateToReferencedModelModule } from "@miragon/bpmn-model-navigation";
 *
 * new BpmnModeler({ additionalModules: [NavigateToReferencedModelModule] });
 * ```
 *
 * Requires a `vsCodeBridge` DI value with a `postMessage` method (the
 * bpmn-webview provides this so the existing single VS Code API instance
 * is reused).
 */
import { NavigateContextPadProvider } from "./NavigateContextPadProvider";
import { FormReferenceStatusClient } from "./FormReferenceStatusClient";

export { extractReference } from "./extractReference";
export { FormReferenceStatusClient } from "./FormReferenceStatusClient";

export const NavigateToReferencedModelModule = {
    __init__: ["formReferenceStatusClient", "navigateContextPadProvider"],
    formReferenceStatusClient: ["type", FormReferenceStatusClient],
    navigateContextPadProvider: ["type", NavigateContextPadProvider],
};
