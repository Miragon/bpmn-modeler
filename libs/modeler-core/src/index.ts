/**
 * Public API of `@miragon/bpmn-modeler-core` — the host-agnostic BPMN/DMN
 * modeling engine. Both consumers (the VS Code plugin, in-process; the IntelliJ
 * host bridge, out-of-process) import only from here, never from deep paths.
 *
 * The surface is the union of what the Node bridge consumes (services, stores,
 * router, ports, domain handles) and what the VS Code composition root wires.
 */

// ── shared: domain ──────────────────────────────────────────────────────────
export * from "./shared/domain/BpmnDocument";
export * from "./shared/domain/EditorSession";
export * from "./shared/domain/EditorSessionParticipant";
export * from "./shared/domain/engineVersions";
export * from "./shared/domain/errors";
export * from "./shared/domain/globToRegExp";
export * from "./shared/domain/hostPorts";
export * from "./shared/domain/newModelEngine";
export * from "./shared/domain/session";
export * from "./shared/domain/viewTypes";

// ── shared: service + vscode-free infrastructure ────────────────────────────
export * from "./shared/service/ArtifactService";
export * from "./shared/service/BpmnLintConfigLocator";
export * from "./shared/service/DocumentFlushService";
export * from "./shared/infrastructure/EditorSessionDocuments";
export * from "./shared/infrastructure/EditorSessionLifecycle";
export * from "./shared/infrastructure/EditorDocumentSync";
export * from "./shared/infrastructure/documentMessageHandlers";
export * from "./shared/session/DocumentRenderParticipant";
export * from "./shared/infrastructure/EditorSessionStore";
export * from "./shared/infrastructure/WebviewMessageRouter";
export * from "./shared/infrastructure/webviewLogHandlers";
export * from "./shared/infrastructure/webviewNotificationHandlers";
export * from "./shared/infrastructure/orderedDocumentDispatch";
export * from "./shared/infrastructure/webviewFocusHandlers";
export * from "./shared/infrastructure/helpers";

// ── modeler ─────────────────────────────────────────────────────────────────
export * from "./modeler/bpmn/domain/model";
export * from "./modeler/bpmn/service/BpmnModelerService";
export * from "./modeler/bpmn/infrastructure/bpmnMessageHandlers";
export * from "./modeler/bpmn/service/BpmnElementTemplatesService";
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

// ── diff ─────────────────────────────────────────────────────────────────────
export * from "./diff/domain/DiffSession";
export * from "./diff/service/BpmnDiffService";
export * from "./diff/infrastructure/DiffPaneStore";

// ── navigation ───────────────────────────────────────────────────────────────
export * from "./navigation/service/ModelNavigationService";
export * from "./navigation/service/ReferencedModelLocator";
export * from "./navigation/service/FormReferenceStatusService";
export * from "./navigation/session/FormReferenceStatusParticipant";
export * from "./navigation/infrastructure/navigationMessageHandlers";

// ── definition search ────────────────────────────────────────────────────────
export * from "./definitionSearch/service/WorkspaceDefinitionIndex";
export * from "./definitionSearch/service/DefinitionSearchService";
export * from "./definitionSearch/session/DefinitionSearchParticipant";
export * from "./definitionSearch/infrastructure/definitionSearchMessageHandlers";

// ── codeLink ─────────────────────────────────────────────────────────────────
export * from "./codeLink/service/ImplementationLocator";
export * from "./codeLink/service/ImplementationNavigationService";
export * from "./codeLink/service/CodeLinkMapService";
export * from "./codeLink/service/SourceIndex";
export * from "./codeLink/session/CodeLinkParticipant";
export * from "./codeLink/infrastructure/codeLinkMessageHandlers";

// ── migration ────────────────────────────────────────────────────────────────
export * from "./migration/domain/MigrationPlan";
export * from "./migration/service/BpmnMigrationService";

// ── deployment ───────────────────────────────────────────────────────────────
export * from "./deployment/domain/deployment";
export * from "./deployment/domain/deploymentLedger";
export * from "./deployment/domain/deploymentTarget";
export * from "./deployment/domain/deploymentVerification";
export * from "./deployment/domain/envRef";
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
export * from "./deployment/infrastructure/FetchHttpClient";
export * from "./deployment/infrastructure/camunda/AuthHeaderResolver";
export * from "./deployment/infrastructure/camunda/Camunda7RestClient";
export * from "./deployment/infrastructure/camunda/Camunda8RestClient";
export * from "./deployment/infrastructure/camunda/CamundaEngineRouter";
export * from "./deployment/infrastructure/camunda/MultipartBuilder";

// ── template-marketplace ─────────────────────────────────────────────────────
export * from "./template-marketplace/domain/marketplace";
export * from "./template-marketplace/domain/ports";
export * from "./template-marketplace/infrastructure/GitHubSource";
export * from "./template-marketplace/infrastructure/GitLabSource";
export * from "./template-marketplace/infrastructure/LocalFileSource";
export * from "./template-marketplace/infrastructure/MarketplaceCache";
export * from "./template-marketplace/service/TemplateMarketplaceService";
export * from "./template-marketplace/MarketplaceFeature";

// ── scriptTask: domain ───────────────────────────────────────────────────────
export * from "./scriptTask/domain/ScriptUri";
export * from "./scriptTask/domain/ScriptVariableStore";
export * from "./scriptTask/domain/camundaDts";
export * from "./scriptTask/domain/groovyImports";
export * from "./scriptTask/domain/localDeclarations";
export * from "./scriptTask/domain/scriptApi";
export * from "./scriptTask/domain/scriptCompletion";
export * from "./scriptTask/domain/scriptFileMatching";
export * from "./scriptTask/domain/scriptLanguage";

// ── scriptTask: service ──────────────────────────────────────────────────────
export * from "./scriptTask/service/ScriptVariableManifestService";
export * from "./scriptTask/service/ScriptXmlService";
export * from "./scriptTask/service/scriptBatch";
