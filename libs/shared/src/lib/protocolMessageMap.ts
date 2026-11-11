import type {
    AddOnActionResultQuery,
    AddOnCatalogQuery,
    AddOnRequestCommand,
    BrandModeQuery,
    GetAddOnCatalogCommand,
    OpenAddOnDetailCommand,
    RevealAddOnsQuery,
    ShowAddOnQuery,
} from "./addOnsView";
import type {
    ApplyDmnDiffHighlightsQuery,
    DmnDiffScrollChangedCommand,
    DmnDiffViewChangedCommand,
    SyncDmnDiffScrollQuery,
    SyncDmnDiffViewQuery,
} from "./dmnDiffMessages";
import type {
    DocumentFlushedCommand,
    FlushDocumentQuery,
    LogDebugCommand,
    LogErrorCommand,
    LogInfoCommand,
    LogWarningCommand,
    ReleaseDocumentFlushQuery,
    RequestFocusCommand,
    ShowInfoCommand,
    SyncDocumentCommand,
    TakeFocusQuery,
} from "./messages";
import type {
    AdditionalFilesQuery,
    ApplyDiffHighlightsQuery,
    BpmnFileQuery,
    BpmnLintDisabledQuery,
    BpmnModelerSettingQuery,
    BpmnPluginsQuery,
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
    CleanupDiagramQuery,
    CleanupReportCommand,
    ClipboardQuery,
    CreateTargetCommand,
    CursorChangedCommand,
    DiffPlaneChangedCommand,
    DeleteTargetCommand,
    DeployCommand,
    DeploymentResultQuery,
    DeploymentTargetsQuery,
    DiagramFormattedCommand,
    DiffReadyCommand,
    DmnFileQuery,
    DmnModelerSettingQuery,
    ElementIdReviewCommand,
    ElementTemplateFileQuery,
    ElementTemplatesQuery,
    FocusElementQuery,
    FormDefaultsQuery,
    FormFileQuery,
    FormInputValuesQuery,
    FormReferenceStatusQuery,
    FormPreviewQuery,
    GetFormPreviewCommand,
    FormatDiagramQuery,
    GenerateElementIdsQuery,
    GetBpmnFileCommand,
    GetBpmnModelerSettingCommand,
    GetBpmnlintConfigCommand,
    GetClipboardCommand,
    GetDiagramAsSVGCommand,
    GetDmnFileCommand,
    GetDmnModelerSettingCommand,
    GetElementTemplatesCommand,
    GetBpmnPluginsCommand,
    GetElementTemplateFileCommand,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    GetFormReferenceStatusCommand,
    GetPropertiesPanelStateCommand,
    GetTextClipboardCommand,
    HiddenElementTemplatesQuery,
    ImplementationStatusQuery,
    LanguageQuery,
    NavigateToImplementationCommand,
    NavigateToReferencedModelCommand,
    OpenAllScriptTasksQuery,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    OpenTargetsFileCommand,
    ProcessDefinitionKeyQuery,
    PropertiesPanelStateQuery,
    RequestAdditionalFilesCommand,
    RequestFormDefaultsCommand,
    RequestPayloadFilesCommand,
    RequestStoredCredentialsCommand,
    SaveTargetCommand,
    SearchWorkspaceDefinitionsCommand,
    SelectTargetCommand,
    SelectedPayloadFileQuery,
    SetClipboardCommand,
    SetLintingEnabledCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    StartInstanceCommand,
    StartInstanceResultQuery,
    StoredCredentialsQuery,
    SwapCompareSidesCommand,
    SyncActivitiesCommand,
    SyncCursorQuery,
    SyncDiffPlaneQuery,
    SyncViewportQuery,
    TargetSavedQuery,
    TextClipboardQuery,
    UpdateFormOutputValuesCommand,
    UpdateLintResultsCommand,
    UpdateOpenScriptEditorsQuery,
    UpdateScriptContentQuery,
    UpdateScriptFormatQuery,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
    ViewportChangedCommand,
    WorkspaceDefinitionsQuery,
} from "./modeler";

export type ProtocolQuery =
    | FlushDocumentQuery
    | ReleaseDocumentFlushQuery
    | TakeFocusQuery
    | BpmnFileQuery
    | DmnFileQuery
    | FormFileQuery
    | FormInputValuesQuery
    | ElementTemplateFileQuery
    | ElementTemplatesQuery
    | HiddenElementTemplatesQuery
    | BpmnPluginsQuery
    | BpmnlintResultsQuery
    | BpmnLintDisabledQuery
    | BpmnlintInPageQuery
    | FocusElementQuery
    | BpmnModelerSettingQuery
    | DmnModelerSettingQuery
    | PropertiesPanelStateQuery
    | ClipboardQuery
    | TextClipboardQuery
    | UpdateScriptFormatQuery
    | UpdateScriptContentQuery
    | UpdateOpenScriptEditorsQuery
    | LanguageQuery
    | ImplementationStatusQuery
    | FormReferenceStatusQuery
    | FormPreviewQuery
    | WorkspaceDefinitionsQuery
    | OpenAllScriptTasksQuery
    | FormatDiagramQuery
    | CleanupDiagramQuery
    | GenerateElementIdsQuery
    | FormDefaultsQuery
    | DeploymentResultQuery
    | StoredCredentialsQuery
    | AdditionalFilesQuery
    | DeploymentTargetsQuery
    | TargetSavedQuery
    | StartInstanceResultQuery
    | SelectedPayloadFileQuery
    | ProcessDefinitionKeyQuery
    | ApplyDiffHighlightsQuery
    | SyncViewportQuery
    | SyncCursorQuery
    | SyncDiffPlaneQuery
    | ApplyDmnDiffHighlightsQuery
    | SyncDmnDiffViewQuery
    | SyncDmnDiffScrollQuery
    | AddOnCatalogQuery
    | AddOnActionResultQuery
    | RevealAddOnsQuery
    | ShowAddOnQuery
    | BrandModeQuery;

export type ProtocolCommand =
    | SyncDocumentCommand
    | DocumentFlushedCommand
    | LogDebugCommand
    | LogInfoCommand
    | LogWarningCommand
    | LogErrorCommand
    | ShowInfoCommand
    | RequestFocusCommand
    | GetBpmnFileCommand
    | GetDiagramAsSVGCommand
    | GetDmnFileCommand
    | GetFormFileCommand
    | GetFormInputValuesCommand
    | UpdateFormOutputValuesCommand
    | GetElementTemplateFileCommand
    | GetElementTemplatesCommand
    | GetBpmnPluginsCommand
    | GetBpmnlintConfigCommand
    | GetBpmnModelerSettingCommand
    | GetDmnModelerSettingCommand
    | GetPropertiesPanelStateCommand
    | SetPropertiesPanelStateCommand
    | SetLintingEnabledCommand
    | UpdateLintResultsCommand
    | GetClipboardCommand
    | NavigateToReferencedModelCommand
    | GetFormReferenceStatusCommand
    | SearchWorkspaceDefinitionsCommand
    | GetFormPreviewCommand
    | NavigateToImplementationCommand
    | SyncActivitiesCommand
    | SetClipboardCommand
    | GetTextClipboardCommand
    | SetTextClipboardCommand
    | OpenScriptEditorCommand
    | DiagramFormattedCommand
    | CleanupReportCommand
    | ElementIdReviewCommand
    | OpenScriptEditorsCommand
    | UpdateScriptSourceCommand
    | UpdateScriptVariablesCommand
    | RequestFormDefaultsCommand
    | DeployCommand
    | RequestAdditionalFilesCommand
    | RequestStoredCredentialsCommand
    | SelectTargetCommand
    | SaveTargetCommand
    | CreateTargetCommand
    | DeleteTargetCommand
    | OpenTargetsFileCommand
    | StartInstanceCommand
    | RequestPayloadFilesCommand
    | ViewportChangedCommand
    | CursorChangedCommand
    | DiffPlaneChangedCommand
    | DiffReadyCommand
    | SwapCompareSidesCommand
    | DmnDiffViewChangedCommand
    | DmnDiffScrollChangedCommand
    | GetAddOnCatalogCommand
    | AddOnRequestCommand
    | OpenAddOnDetailCommand;

export type ProtocolMessage = ProtocolQuery | ProtocolCommand;

export type ProtocolMessageType = ProtocolMessage["type"];

export type ProtocolCommandType = ProtocolCommand["type"];

export type MessageOfType<TType extends ProtocolMessageType> = Extract<
    ProtocolMessage,
    { type: TType }
>;

export function isMessageOfType<TType extends ProtocolMessageType>(
    message: { type?: unknown } | null | undefined,
    type: TType,
): message is MessageOfType<TType> {
    return message?.type === type;
}

/** Inbound messages are untrusted JSON; narrowing happens per `case` on the result. */
export function asProtocolMessage(message: { type: string }): ProtocolMessage {
    return message as ProtocolMessage;
}
