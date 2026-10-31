/**
 * The custom-editor `viewType` identifiers, kept in one vscode-free module
 * so the VS Code editor registrations
 * (`apps/vscode-plugin/src/composition/bpmnEditorFeature.ts` and
 * `editorFeature.ts`) and webview bootstrap
 * (`apps/vscode-plugin/src/shared/infrastructure/bootstrapWebview.ts`) agree by
 * import rather than by two independently-maintained string literals. They must
 * also match `contributes.customEditors[].viewType` in `package.json`; the
 * manifest-contract spec asserts that link.
 */

// Custom-editor viewType for `.bpmn` files.
export const BPMN_VIEW_TYPE = "bpmn-modeler.bpmn";

// Custom-editor viewType for `.dmn` files.
export const DMN_VIEW_TYPE = "bpmn-modeler.dmn";

// Custom-editor viewType for `.form` files.
export const FORM_VIEW_TYPE = "bpmn-modeler.form";

// Custom-editor viewType for the element-template preview beside a `.json` file.
export const ELEMENT_TEMPLATE_EDITOR_VIEW_TYPE = "bpmn-modeler.elementTemplateEditor";
