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
export * from "./shared/domain/engineVersions";
export * from "./shared/domain/errors";
export * from "./shared/domain/hostPorts";
export * from "./shared/domain/session";
export * from "./shared/domain/viewTypes";

// ── shared: service + vscode-free infrastructure ────────────────────────────
export * from "./shared/service/ArtifactService";
export * from "./shared/service/BpmnLintConfigLocator";
export * from "./shared/infrastructure/EditorSessionStore";
export * from "./shared/infrastructure/WebviewMessageRouter";
export * from "./shared/infrastructure/webviewLogHandlers";
export * from "./shared/infrastructure/helpers";

// ── modeler ─────────────────────────────────────────────────────────────────
export * from "./modeler/bpmn/domain/model";
export * from "./modeler/bpmn/service/BpmnModelerService";
export * from "./modeler/bpmn/service/BpmnElementTemplatesService";
export * from "./modeler/bpmn/service/BpmnLintConfigService";
export * from "./modeler/bpmn/service/BpmnClipboardMediator";
export * from "./modeler/bpmn/service/BpmnPropertiesPanelService";
export * from "./modeler/bpmn/service/BpmnSettingsBroadcaster";
export * from "./modeler/dmn/service/DmnModelerService";
export * from "./modeler/dmn/service/DmnSettingsBroadcaster";

// ── diff ─────────────────────────────────────────────────────────────────────
export * from "./diff/domain/DiffSession";
export * from "./diff/service/BpmnDiffService";
export * from "./diff/infrastructure/DiffPaneStore";

// ── navigation ───────────────────────────────────────────────────────────────
export * from "./navigation/service/ModelNavigationService";
export * from "./navigation/service/ReferencedModelLocator";

// ── codeLink ─────────────────────────────────────────────────────────────────
export * from "./codeLink/service/ImplementationLocator";
export * from "./codeLink/service/ImplementationNavigationService";
export * from "./codeLink/service/CodeLinkMapService";

// ── migration ────────────────────────────────────────────────────────────────
export * from "./migration/domain/MigrationPlan";
export * from "./migration/service/BpmnMigrationService";

// ── deployment ───────────────────────────────────────────────────────────────
export * from "./deployment/domain/deployment";
export * from "./deployment/domain/ports";
export * from "./deployment/domain/startInstance";
export * from "./deployment/service/DeploymentService";
export * from "./deployment/service/StartInstanceService";
export * from "./deployment/service/DeploymentMessageDispatcher";
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
export * from "./template-marketplace/infrastructure/MarketplaceCache";
export * from "./template-marketplace/service/TemplateMarketplaceService";

// ── scriptTask: domain ───────────────────────────────────────────────────────
export * from "./scriptTask/domain/ScriptUri";
export * from "./scriptTask/domain/ScriptVariableStore";
export * from "./scriptTask/domain/scriptApi";
export * from "./scriptTask/domain/scriptCompletion";
export * from "./scriptTask/domain/scriptLanguage";

// ── scriptTask: service ──────────────────────────────────────────────────────
export * from "./scriptTask/service/ScriptVariableManifestService";
