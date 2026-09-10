import { resolve } from "node:path";

/**
 * Path aliases shared by the jsdom and browser Vitest projects. Workspace libs
 * without a package entry point, plus the ESM overrides specs need at runtime
 * (the lib builds resolve these through tsconfig paths / vite-tsconfig-paths).
 */
export const bpmnModelerTestAliases: Record<string, string> = {
    // The minimap's CJS build wraps diagram-js's ESM `IdGenerator` in an
    // interop that leaves it non-constructible under Vitest's runner; the
    // ESM build imports it natively, so specs standing up a real viewer
    // resolve that one instead (the lib build already picks `module` over `main`).
    "diagram-js-minimap": resolve(
        __dirname,
        "../../node_modules/diagram-js-minimap/dist/index.esm.js",
    ),
    "@miragon/bpmn-modeler-types": resolve(__dirname, "../../libs/modeler-types/src/index.ts"),
    // The i18n overlay lib has no package entry point; the mode strip's default
    // translator value-imports it, so specs that load the strip need the path
    // mapped explicitly (the lib build uses tsconfig paths).
    "@miragon/bpmn-modeler-i18n-extras": resolve(
        __dirname,
        "../../libs/bpmn-i18n-extras/src/index.ts",
    ),
    "@miragon/bpmn-modeler-diff": resolve(__dirname, "../../libs/bpmn-diff/src/index.ts"),
    // These workspace libs have no package entry point, so specs that load them
    // at runtime (capabilityModules, clipboard) need the path mapped explicitly.
    "@miragon/bpmn-model-navigation": resolve(
        __dirname,
        "../../libs/model-navigation/src/index.ts",
    ),
    "@miragon/bpmn-modeler-code-link": resolve(__dirname, "../../libs/code-link/src/index.ts"),
    "@miragon/bpmn-modeler-inline-scripting": resolve(
        __dirname,
        "../../libs/inline-scripting/src/index.ts",
    ),
    "@miragon/bpmn-modeler-clipboard": resolve(__dirname, "../../libs/bpmn-clipboard/src/index.ts"),
    "@miragon/bpmn-modeler-layout": resolve(__dirname, "../../libs/bpmn-layout/src/index.ts"),
    // Directory (not index.ts) so the viewer's deep imports
    // (`.../render/index` etc.) resolve through the same alias.
    "@miragon/bpmn-modeler-properties-panel": resolve(__dirname, "../../libs/properties-panel/src"),
};
