/**
 * Public API of `@miragon/bpmn-modeler-core` — the host-agnostic BPMN/DMN
 * modeling engine. Both consumers (the VS Code plugin, in-process; the IntelliJ
 * host bridge, out-of-process) import only from here, never from deep paths.
 *
 * The surface is the union of what the Node bridge consumes (services, stores,
 * router, ports, domain handles) and what the VS Code composition root wires.
 */

// ── kernel ───────────────────────────────────────────────────────────────────
export * from "./kernel/domain/affectedItems";
export * from "./kernel/domain/BpmnDocument";
export * from "./kernel/domain/engineVersions";
export * from "./kernel/domain/errorLogText";
export * from "./kernel/domain/errors";
export * from "./kernel/domain/escapeRegExpLiteral";
export * from "./kernel/domain/globToRegExp";
export * from "./kernel/domain/hostPorts";
export * from "./kernel/domain/http";
export * from "./kernel/domain/locateResult";
export * from "./kernel/domain/modelerSettings";
export * from "./kernel/domain/newModelEngine";
export * from "./kernel/domain/prompts";
export * from "./kernel/domain/rootContainment";
export * from "./kernel/domain/statusView";
export * from "./kernel/domain/textReplacement";
export * from "./kernel/domain/viewTypes";
export * from "./kernel/domain/watcherEvents";
export * from "./kernel/domain/workspacePath";
export * from "./kernel/service/ArtifactService";
export * from "./kernel/infrastructure/FetchHttpClient";
export * from "./kernel/infrastructure/nonce";

// ── editorSession ────────────────────────────────────────────────────────────
export { FOCUS_BPMN_DIAGRAM_MESSAGE } from "./editorSession/domain/CommandTarget";
export * from "./editorSession/domain/EditorSession";
export * from "./editorSession/domain/EditorSessionParticipant";
export * from "./editorSession/domain/session";
export * from "./editorSession/service/DocumentFlushService";
export * from "./editorSession/service/EditorContribution";
export * from "./editorSession/service/EditorDocumentSync";
export * from "./editorSession/service/EditorHandle";
export * from "./editorSession/service/EditorSessionDocuments";
export * from "./editorSession/service/EditorSessionLifecycle";
export * from "./editorSession/service/EditorSessionStore";
export * from "./editorSession/service/orderedDocumentDispatch";
export * from "./editorSession/service/PendingEditsFlush";
export * from "./editorSession/service/WebviewMessageRouter";
export * from "./editorSession/service/webviewLog";
export * from "./editorSession/session/DocumentRenderParticipant";
export * from "./editorSession/infrastructure/documentMessageHandlers";
export * from "./editorSession/infrastructure/webviewFocusMessageHandlers";
export * from "./editorSession/infrastructure/webviewLogMessageHandlers";
export * from "./editorSession/infrastructure/webviewNotificationMessageHandlers";

// ── modeler ─────────────────────────────────────────────────────────────────
export * from "./modeler/bpmn/BpmnEditorFeature";
export * from "./modeler/bpmn/domain/model";
export * from "./modeler/bpmn/domain/ports";
export * from "./modeler/bpmn/service/BpmnModelerService";
export * from "./modeler/bpmn/infrastructure/bpmnMessageHandlers";
export * from "./modeler/bpmn/service/BpmnElementTemplatesService";
export * from "./modeler/bpmn/service/BpmnLintConfigLocator";
export * from "./modeler/bpmn/service/BpmnLintConfigService";
export * from "./modeler/bpmn/service/DefaultBpmnlintConfigService";
export * from "./modeler/bpmn/infrastructure/bpmnlint/NodeBpmnLinter";
export * from "./modeler/bpmn/infrastructure/bpmnlint/NoopDiagnostics";
export * from "./modeler/bpmn/service/BpmnClipboardMediator";
export * from "./modeler/bpmn/service/BpmnPropertiesPanelService";
export * from "./modeler/bpmn/service/BpmnLayoutService";
export * from "./modeler/bpmn/service/BpmnSettingsBroadcaster";
export * from "./modeler/bpmn/session/BpmnSettingsParticipant";
export * from "./modeler/bpmn/session/BpmnlintParticipant";
export * from "./modeler/bpmn/session/ElementTemplatesParticipant";
export * from "./modeler/bpmn/session/EngineVersionStatusBarParticipant";
export * from "./modeler/dmn/domain/emptyDmn";
export * from "./modeler/dmn/service/DmnModelerService";
export * from "./modeler/dmn/service/DmnSettingsBroadcaster";
export * from "./modeler/dmn/session/DmnSettingsParticipant";
export * from "./modeler/dmn/infrastructure/dmnMessageHandlers";
export * from "./modeler/form/domain/emptyForm";
export * from "./modeler/form/service/FormModelerService";
export * from "./modeler/elementTemplate/service/ElementTemplatePreviewService";
export * from "./modeler/elementTemplate/session/PreviewLanguageParticipant";

// ── diff ─────────────────────────────────────────────────────────────────────
export * from "./diff/domain/DiffSession";
export * from "./diff/service/BpmnDiffService";
export * from "./diff/service/DiffPaneStore";

// ── navigation ───────────────────────────────────────────────────────────────
export * from "./navigation/service/ModelNavigationService";
export * from "./navigation/service/ReferencedModelLocator";
export * from "./navigation/service/FormReferenceStatusService";
export * from "./navigation/session/FormReferenceStatusParticipant";
export * from "./navigation/infrastructure/navigationMessageHandlers";
export * from "./navigation/NavigationFeature";

// ── definition search ────────────────────────────────────────────────────────
export * from "./definitionSearch/service/WorkspaceDefinitionIndex";
export * from "./definitionSearch/service/DefinitionSearchService";
export * from "./definitionSearch/session/DefinitionSearchParticipant";
export * from "./definitionSearch/infrastructure/definitionSearchMessageHandlers";
export * from "./definitionSearch/DefinitionSearchFeature";

// ── codeLink ─────────────────────────────────────────────────────────────────
export * from "./codeLink/service/ImplementationLocator";
export * from "./codeLink/service/ImplementationNavigationService";
export * from "./codeLink/service/CodeLinkMapService";
export * from "./codeLink/service/SourceIndex";
export * from "./codeLink/session/CodeLinkParticipant";
export * from "./codeLink/infrastructure/codeLinkMessageHandlers";
export * from "./codeLink/CodeLinkFeature";

// ── migration ────────────────────────────────────────────────────────────────
export * from "./migration/domain/MigrationPlan";
export * from "./migration/domain/ports";
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
export * from "./deployment/domain/ports";
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
export * from "./deployment/session/DeploymentStatusParticipant";
export * from "./deployment/DeploymentFeature";
export * from "./deployment/infrastructure/camunda/AuthHeaderResolver";
export * from "./deployment/infrastructure/camunda/Camunda7RestClient";
export * from "./deployment/infrastructure/camunda/Camunda8RestClient";
export * from "./deployment/infrastructure/camunda/CamundaEngineRouter";
export * from "./deployment/infrastructure/camunda/MultipartBuilder";

// ── template-marketplace ─────────────────────────────────────────────────────
export * from "./template-marketplace/domain/fetchReport";
export * from "./template-marketplace/domain/marketplace";
export * from "./template-marketplace/domain/ports";
export * from "./template-marketplace/infrastructure/GitHubSource";
export * from "./template-marketplace/infrastructure/GitLabSource";
export * from "./template-marketplace/infrastructure/LocalFileSource";
export * from "./template-marketplace/service/MarketplaceCache";
export * from "./template-marketplace/service/TemplateMarketplaceService";
export * from "./template-marketplace/MarketplaceFeature";

// ── scriptTask: domain ───────────────────────────────────────────────────────
export * from "./scriptTask/domain/ports";
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
export * from "./scriptTask/ScriptEditorFeature";
