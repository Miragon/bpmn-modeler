/**
 * Public API of `@miragon/bpmn-modeler-core` — the host-agnostic BPMN/DMN
 * modeling engine. Both consumers (the VS Code plugin, in-process; the IntelliJ
 * host bridge, out-of-process) import only from here, never from deep paths.
 *
 * The surface is the union of what the Node bridge consumes (services, stores,
 * router, ports, domain handles) and what the VS Code composition root wires.
 */

// ── kernel ───────────────────────────────────────────────────────────────────
export * from "./kernel/domain/actionNotice";
export * from "./kernel/domain/affectedItems";
export * from "./kernel/domain/BpmnDocument";
export {
    type Allowance,
    allowanceKeyOf,
    allowanceOf,
    allowanceRowOf,
    allowingAllowances,
    LOCAL_HOST,
} from "./kernel/domain/allowance";
export type { AllowanceKind } from "./kernel/domain/approvalRowKind";
export {
    approvalsAfter,
    approvalsKey,
    codeApprovalChange,
    type CodeApprovalChange,
    type ReviewAnswer,
    revoking,
} from "./kernel/domain/codeApproval";
export * from "./kernel/domain/engineVersions";
export * from "./kernel/domain/errorLogText";
export * from "./kernel/domain/errors";
export * from "./kernel/domain/escapeRegExpLiteral";
export { isIgnoredWatchDirName } from "./kernel/domain/excludedDirs";
export * from "./kernel/domain/globToRegExp";
export * from "./kernel/port/hostPorts";
export * from "./kernel/port/repositoryFilesPort";
export * from "./kernel/domain/http";
export * from "./kernel/port/HttpClient";
export * from "./kernel/port/templatePreferencePorts";
export * from "./kernel/domain/locateResult";
export * from "./kernel/domain/modelerSettings";
export * from "./kernel/domain/newModelEngine";
export * from "./kernel/domain/projectScopes";
export * from "./kernel/domain/prompts";
export * from "./kernel/domain/rootContainment";
export * from "./kernel/domain/statusView";
export * from "./kernel/domain/templatePreferences";
export * from "./kernel/domain/textReplacement";
export * from "./kernel/domain/viewTypes";
export * from "./kernel/domain/watcherEvents";
export * from "./kernel/domain/workspacePath";
export * from "./kernel/service/AllowanceLocator";
export * from "./kernel/service/ArtifactService";
export * from "./kernel/service/ContentRowMigration";
export * from "./kernel/service/QuestionQueue";
export * from "./kernel/adapter/out/FetchHttpClient";
export { ListReview } from "./kernel/adapter/out/ListReview";
export type { ApprovalReviewPort, ApprovalReviewRequest } from "./kernel/port/approvalPorts";
export * from "./kernel/domain/nonce";

// ── editorSession ────────────────────────────────────────────────────────────
export { FOCUS_BPMN_DIAGRAM_MESSAGE } from "./editorSession/domain/CommandTarget";
export * from "./editorSession/domain/EditorSession";
export * from "./editorSession/domain/EditorSessionParticipant";
export * from "./editorSession/domain/session";
export * from "./editorSession/service/DocumentFlushService";
export * from "./editorSession/service/EditorContribution";
export * from "./editorSession/service/EditorDocumentSync";
export * from "./editorSession/service/EngineVersionSelectionService";
export * from "./editorSession/port/EditorHandle";
export * from "./editorSession/service/EditorSessionDocuments";
export * from "./editorSession/service/EditorSessionLifecycle";
export * from "./editorSession/service/EditorSessionStore";
export * from "./editorSession/service/orderedDocumentDispatch";
export * from "./editorSession/service/PendingEditsFlush";
export * from "./editorSession/service/WebviewMessageRouter";
export * from "./editorSession/service/webviewLog";
export * from "./editorSession/service/DocumentRenderParticipant";
export * from "./editorSession/adapter/in/documentMessageHandlers";
export * from "./editorSession/adapter/in/webviewFocusMessageHandlers";
export * from "./editorSession/adapter/in/webviewLogMessageHandlers";
export * from "./editorSession/adapter/in/webviewNotificationMessageHandlers";

// ── modeler ─────────────────────────────────────────────────────────────────
export * from "./modeler/bpmn/composition/BpmnEditorFeature";
export * from "./modeler/bpmn/domain/model";
export * from "./modeler/bpmn/port/bpmnPorts";
export * from "./modeler/bpmn/port/installedPackagesPort";
export * from "./modeler/bpmn/service/BpmnModelerService";
export * from "./modeler/bpmn/adapter/in/bpmnMessageHandlers";
export * from "./modeler/bpmn/service/BpmnElementTemplatesService";
export * from "./modeler/bpmn/service/BpmnLintConfigLocator";
export * from "./modeler/bpmn/service/BpmnLintConfigService";
export * from "./modeler/bpmn/service/DefaultBpmnlintConfigService";
export * from "./modeler/bpmn/adapter/out/bpmnlint/NodeBpmnLinter";
export * from "./modeler/bpmn/adapter/out/bpmnlint/NoopDiagnostics";
export * from "./modeler/bpmn/service/BpmnClipboardMediator";
export * from "./modeler/bpmn/service/BpmnPropertiesPanelService";
export * from "./modeler/bpmn/service/BpmnLayoutService";
export * from "./modeler/bpmn/service/BpmnSettingsBroadcaster";
export * from "./modeler/bpmn/service/BpmnSettingsParticipant";
export * from "./modeler/bpmn/service/BpmnlintParticipant";
export * from "./modeler/bpmn/service/ElementTemplatesParticipant";
export * from "./modeler/bpmn/service/EngineVersionStatusBarParticipant";
export * from "./modeler/dmn/service/DmnModelerService";
export * from "./modeler/dmn/service/DmnSettingsBroadcaster";
export * from "./modeler/dmn/service/DmnSettingsParticipant";
export * from "./modeler/dmn/adapter/in/dmnMessageHandlers";
export * from "./modeler/form/domain/emptyForm";
export * from "./modeler/domain/newModelFilePrompt";
export * from "./modeler/form/service/FormModelerService";
export type { FormEngineSelectionPorts } from "./modeler/form/service/FormEngineSelectionService";
export * from "./modeler/form/service/FormEngineStatusBarParticipant";
export * from "./modeler/form/adapter/out/JsonFormTextEdits";
export * from "./editorSession/domain/StatusItemOwnership";
export * from "./modeler/elementTemplate/domain/newTemplateFile";
export * from "./modeler/elementTemplate/composition/ElementTemplateEditorFeature";

// ── bpmnPlugins ──────────────────────────────────────────────────────────────
export * from "./bpmnPlugins/domain/pluginApproval";
export * from "./bpmnPlugins/port/pluginPorts";
export * from "./bpmnPlugins/composition/BpmnPluginsFeature";

// ── addOns ───────────────────────────────────────────────────────────────────
export type {
    ActionView,
    AddOnCatalogModel,
    AddOnGroupView,
    AddOnReveal,
    AddOnRevealTarget,
    AddOnReview,
    AddOnSourceView,
    AddOnView,
    CodeAddOnView,
    TemplateAddOnView,
} from "./addOns/domain/addOnCatalogModel";
export type {
    AddOnActionKind,
    AddOnKind,
    CatalogActionKind,
    CodeAddOnKind,
    GroupKind,
    SourceActionKind,
    SourceKind,
    TemplateState,
} from "./addOns/domain/addOnIds";
export type { AddOnActionResult, AddOnRefusal, AddOnRequest } from "./addOns/domain/addOnRequests";
export type {
    MarketplaceAddOnSource,
    SettingChanges,
    TemplateAddOnSource,
} from "./addOns/port/addOnSourcePorts";
export type { AddOnViewConnection } from "./addOns/service/AddOnViewHub";
export type { AddOnViewRevealPort } from "./addOns/port/addOnViewPorts";
export { ViewReview } from "./addOns/adapter/out/ViewReview";
export * from "./addOns/composition/AddOnsFeature";

// ── diff ─────────────────────────────────────────────────────────────────────
export * from "./diff/domain/basenameOfUriString";
export * from "./diff/port/DiffPaneHandle";
export * from "./diff/service/DiffSession";
export * from "./diff/service/BpmnDiffService";
export * from "./diff/service/DiffPaneStore";
export * from "./diff/service/diffPaneRouter";

// ── navigation ───────────────────────────────────────────────────────────────
export * from "./navigation/service/ModelNavigationService";
export * from "./navigation/service/FormPreviewService";
export * from "./navigation/service/ReferencedModelLocator";
export * from "./navigation/service/FormReferenceStatusService";
export * from "./navigation/service/FormReferenceStatusParticipant";
export * from "./navigation/adapter/in/navigationMessageHandlers";
export * from "./navigation/composition/NavigationFeature";

// ── definition search ────────────────────────────────────────────────────────
export * from "./definitionSearch/service/WorkspaceDefinitionIndex";
export * from "./definitionSearch/service/DefinitionSearchService";
export * from "./definitionSearch/service/DefinitionSearchParticipant";
export * from "./definitionSearch/adapter/in/definitionSearchMessageHandlers";
export * from "./definitionSearch/composition/DefinitionSearchFeature";

// ── codeLink ─────────────────────────────────────────────────────────────────
export * from "./codeLink/service/ImplementationLocator";
export * from "./codeLink/service/ImplementationNavigationService";
export * from "./codeLink/service/CodeLinkMapService";
export * from "./codeLink/service/SourceIndex";
export * from "./codeLink/service/CodeLinkParticipant";
export * from "./codeLink/adapter/in/codeLinkMessageHandlers";
export * from "./codeLink/composition/CodeLinkFeature";

// ── migration ────────────────────────────────────────────────────────────────
export * from "./migration/domain/MigrationPlan";
export * from "./migration/service/BpmnMigrationService";

// ── deployment ───────────────────────────────────────────────────────────────
export * from "./deployment/domain/deployment";
export * from "./deployment/domain/deploymentDestination";
export * from "./deployment/domain/deploymentLedger";
export * from "./deployment/domain/deploymentState";
export * from "./deployment/domain/deploymentTarget";
export * from "./deployment/domain/deploymentVerification";
export * from "./deployment/domain/envRef";
export * from "./deployment/domain/errors";
export * from "./deployment/domain/inspectionRequest";
export * from "./deployment/port/deploymentPorts";
export * from "./deployment/domain/startInstance";
export * from "./deployment/domain/urlTemplate";
export * from "./deployment/service/DeployActiveDiagramService";
export * from "./deployment/service/DeployFilesService";
export * from "./deployment/service/DeploymentService";
export * from "./deployment/service/DeploymentStatusService";
export * from "./deployment/service/DeploymentTargetService";
export * from "./deployment/service/EnvValueResolver";
export * from "./deployment/service/StartInstanceService";
export * from "./deployment/service/DeploymentVerificationService";
export * from "./deployment/service/DeploymentMessageDispatcher";
export * from "./deployment/service/DeploymentStatusParticipant";
export * from "./deployment/composition/DeploymentFeature";
export * from "./deployment/adapter/out/camunda/AuthHeaderResolver";
export * from "./deployment/adapter/out/camunda/Camunda7RestClient";
export * from "./deployment/adapter/out/camunda/Camunda8RestClient";
export * from "./deployment/adapter/out/camunda/CamundaEngineRouter";
export * from "./deployment/adapter/out/camunda/MultipartBuilder";

// ── template-marketplace ─────────────────────────────────────────────────────
export * from "./template-marketplace/domain/fetchReport";
export * from "./template-marketplace/domain/marketplace";
export * from "./template-marketplace/domain/repositoryAccessError";
export * from "./template-marketplace/domain/repositorySourceConfig";
export * from "./template-marketplace/domain/marketplaceRegistrations";
export type {
    MarketplaceAddAnswer,
    MarketplaceAddPrompt,
    MarketplaceScopeChoice,
} from "./template-marketplace/domain/marketplacePrompts";
export type { TokenPrompt } from "./template-marketplace/domain/tokenPrompt";
export * from "./template-marketplace/port/marketplacePorts";
export * from "./template-marketplace/adapter/out/GitHubSource";
export * from "./template-marketplace/adapter/out/GitLabSource";
export * from "./template-marketplace/adapter/out/LocalFileSource";
export * from "./template-marketplace/service/MarketplaceCache";
export * from "./template-marketplace/service/MarketplaceCommands";
export * from "./template-marketplace/service/MarketplaceInventory";
export * from "./template-marketplace/service/MarketplaceTemplateSources";
export * from "./template-marketplace/service/TemplateMarketplaceService";
export * from "./template-marketplace/composition/MarketplaceFeature";

// ── scriptTask: domain ───────────────────────────────────────────────────────
export * from "./scriptTask/domain/inlineScript";
export * from "./scriptTask/port/ScriptEditorPort";
export * from "./scriptTask/domain/ScriptUri";
export * from "./scriptTask/domain/ScriptVariableStore";
export * from "./scriptTask/domain/camundaDts";
export * from "./scriptTask/domain/groovyImports";
export * from "./scriptTask/domain/localDeclarations";
export * from "./scriptTask/domain/scriptApi";
export * from "./scriptTask/domain/scriptBaseDir";
export * from "./scriptTask/domain/scriptBatchSummary";
export * from "./scriptTask/domain/scriptCompletion";
export * from "./scriptTask/domain/scriptFileMatching";
export * from "./scriptTask/domain/scriptLanguage";

// ── scriptTask: service ──────────────────────────────────────────────────────
export * from "./scriptTask/service/ScriptFileStore";
export * from "./scriptTask/service/ScriptXmlService";
export * from "./scriptTask/service/scriptBatch";
export * from "./scriptTask/composition/ScriptEditorFeature";

// ── modelerSettings ──────────────────────────────────────────────────────────
export { ModelerLanguageService } from "./modelerSettings/service/ModelerLanguageService";
export type { LanguagePreferencePort } from "./modelerSettings/port/LanguagePreferencePort";
