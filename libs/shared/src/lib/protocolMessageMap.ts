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
    BpmnlintInPageQuery,
    BpmnlintResultsQuery,
    CleanupDiagramQuery,
    CleanupReportCommand,
    ClipboardQuery,
    CreateTargetCommand,
    CursorChangedCommand,
    DeleteTargetCommand,
    DeployCommand,
    DeploymentResultQuery,
    DeploymentTargetsQuery,
    DiagramFormattedCommand,
    DiffReadyCommand,
    DmnFileQuery,
    DmnModelerSettingQuery,
    ElementTemplateFileQuery,
    ElementTemplatesQuery,
    FocusElementQuery,
    FormDefaultsQuery,
    FormFileQuery,
    FormInputValuesQuery,
    FormReferenceStatusQuery,
    FormatDiagramQuery,
    GetBpmnFileCommand,
    GetBpmnModelerSettingCommand,
    GetBpmnlintConfigCommand,
    GetClipboardCommand,
    GetDiagramAsSVGCommand,
    GetDmnFileCommand,
    GetDmnModelerSettingCommand,
    GetElementTemplatesCommand,
    GetElementTemplateFileCommand,
    GetFormFileCommand,
    GetFormInputValuesCommand,
    GetFormReferenceStatusCommand,
    GetPropertiesPanelStateCommand,
    GetTextClipboardCommand,
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
    RequestProcessDefinitionKeyCommand,
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
    | WorkspaceDefinitionsQuery
    | OpenAllScriptTasksQuery
    | FormatDiagramQuery
    | CleanupDiagramQuery
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
    | SyncCursorQuery;

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
    | NavigateToImplementationCommand
    | SyncActivitiesCommand
    | SetClipboardCommand
    | GetTextClipboardCommand
    | SetTextClipboardCommand
    | OpenScriptEditorCommand
    | DiagramFormattedCommand
    | CleanupReportCommand
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
    | RequestProcessDefinitionKeyCommand
    | ViewportChangedCommand
    | CursorChangedCommand
    | DiffReadyCommand
    | SwapCompareSidesCommand;

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

/**
 * Compile-time exhaustiveness check for a switch over a closed message union.
 * At runtime it is a no-op: a message outside the union is ignored, not an error.
 */
export function exhaustiveMessageGuard(message: never): void {
    void message;
}
