export * from "./modeler";
export * from "./theme";
export * from "./viewport";
export * from "./selection";
export * from "./state";
export * from "./propertiesPanelClipboard";
// The resizer lives in libs/shared (framework- and i18n-agnostic, reused by
// the DMN webview); re-exported here so existing `./app` import sites are kept.
export {
    initResizer,
    type PropertiesPanelHandle,
    type PropertiesPanelResizerOptions,
} from "@miragon/bpmn-modeler-shared";
export * from "./vscode";
