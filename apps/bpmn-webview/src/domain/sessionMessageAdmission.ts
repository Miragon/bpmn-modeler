import { FLUSH_QUERY_TYPES } from "@miragon/bpmn-modeler-shared";

export type SessionMessageType =
    | "BpmnFileQuery"
    | "ElementTemplatesQuery"
    | "HiddenElementTemplatesQuery"
    | "BpmnPluginsQuery"
    | "BpmnlintResultsQuery"
    | "BpmnLintDisabledQuery"
    | "BpmnlintInPageQuery"
    | "BpmnModelerSettingQuery"
    | "PropertiesPanelStateQuery"
    | "ClipboardQuery"
    | "TextClipboardQuery"
    | "LanguageQuery"
    | "GetDiagramAsSVGCommand"
    | "OpenAllScriptTasksQuery"
    | "FormatDiagramQuery"
    | "CleanupDiagramQuery"
    | "GenerateElementIdsQuery"
    | "ElementIdConventionQuery"
    | "UpdateScriptContentQuery"
    | "UpdateScriptFormatQuery"
    | "UpdateOpenScriptEditorsQuery"
    | "ImplementationStatusQuery"
    | "FormReferenceStatusQuery"
    | "FormPreviewQuery"
    | "WorkspaceDefinitionsQuery"
    | "FocusElementQuery"
    | "TakeFocusQuery"
    | "FlushDocumentQuery"
    | "ReleaseDocumentFlushQuery";

// The page only waits for its reload; the host's save/close flush still needs an answer.
const ANSWERED_DURING_ENGINE_RELOAD: ReadonlySet<string> = new Set(
    FLUSH_QUERY_TYPES satisfies readonly SessionMessageType[],
);

/**
 * Host replies that act on the imported diagram. The webview requests their
 * sources before the import so the host round trip overlaps it, which means
 * they can arrive before the surface exists; they are held until the initial
 * import has completed. A hidden-templates change is held too, so it is not
 * overtaken by the template list it arrived behind.
 */
const IMPORT_BOUND_MESSAGE_TYPES: ReadonlySet<string> = new Set([
    "ElementTemplatesQuery",
    "HiddenElementTemplatesQuery",
    "BpmnModelerSettingQuery",
    "ElementIdConventionQuery",
    "BpmnlintResultsQuery",
    "BpmnLintDisabledQuery",
    "BpmnlintInPageQuery",
    "LanguageQuery",
    "UpdateScriptContentQuery",
    "UpdateScriptFormatQuery",
    "UpdateOpenScriptEditorsQuery",
    "ImplementationStatusQuery",
] satisfies readonly SessionMessageType[]);

type SessionMessageAdmission = "drop" | "importBound" | "route";

export function admitSessionMessage(
    type: string,
    { engineReloading }: { engineReloading: boolean },
): SessionMessageAdmission {
    if (engineReloading && !ANSWERED_DURING_ENGINE_RELOAD.has(type)) {
        return "drop";
    }
    return IMPORT_BOUND_MESSAGE_TYPES.has(type) ? "importBound" : "route";
}
