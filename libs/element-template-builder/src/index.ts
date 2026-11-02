export { catalogFor } from "./catalog";
export {
    builderStateOf,
    choicesOf,
    EMPTY_PAGE,
    engineOf,
    mainOf,
    messagesOf,
    pageForSelection,
    pageForText,
    pageWithDiagnostics,
    pageWithPreview,
    pageWithRefusal,
} from "./domain/editorPage";
export type {
    EditorMain,
    EditorPage,
    PageMessage,
    TemplateBuilderState,
    TextOrigin,
} from "./domain/editorPage";
export type { Diagnostic } from "./domain/diagnostics";
export type { TemplateChoice } from "./domain/templateFile";
export { elementTypeName } from "./domain/elementTypes";
export { newTemplateText, templateIdentity, withSchema } from "./domain/skeleton";
export { applyTemplateEdits } from "./domain/templateText";
export type { TemplateEdit, TemplateEditResult } from "./domain/templateText";
export { createTemplateBuilder } from "./ui/createTemplateBuilder";
export type { TemplateBuilderHandle, TemplateBuilderOptions } from "./ui/createTemplateBuilder";
