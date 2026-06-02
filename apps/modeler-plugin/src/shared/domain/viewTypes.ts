/**
 * The two custom-editor `viewType` identifiers, kept in one vscode-free module
 * so the editor registration (`composition/editorFeature.ts`) and the webview
 * bootstrap (`shared/infrastructure/bootstrapWebview.ts`) agree by import rather
 * than by two independently-maintained string literals. They must also match
 * `contributes.customEditors[].viewType` in `package.json`; the
 * manifest-contract spec asserts that link.
 */

// Custom-editor viewType for `.bpmn` files.
export const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";

// Custom-editor viewType for `.dmn` files.
export const DMN_VIEW_TYPE = "bpmn-modeler.dmn";
