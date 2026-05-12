/**
 * bpmn-js DI module that adds a "Navigate to referenced model" entry to the
 * context pad around Call Activities (BPMN→BPMN) and Business Rule Tasks
 * (BPMN→DMN).
 *
 * Register as an `additionalModule` when creating the bpmn-js modeler:
 *
 * ```ts
 * import { NavigateToReferencedModelModule } from "@miragon/bpmn-modeler-context-pad-navigate";
 *
 * new BpmnModeler({ additionalModules: [NavigateToReferencedModelModule] });
 * ```
 *
 * Requires a `vsCodeBridge` DI value with a `postMessage` method (the
 * bpmn-webview provides this so the existing single VS Code API instance
 * is reused).
 */
import { NavigateContextPadProvider } from "./NavigateContextPadProvider";

export { extractReference } from "./extractReference";
export type { ReferenceKind } from "./extractReference";

export const NavigateToReferencedModelModule = {
    __init__: ["navigateContextPadProvider"],
    navigateContextPadProvider: ["type", NavigateContextPadProvider],
};
