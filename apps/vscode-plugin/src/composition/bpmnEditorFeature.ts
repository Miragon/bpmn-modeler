import { basename } from "node:path";

import { ExtensionContext } from "vscode";

import { PropertiesPanelStateRepository } from "../modeler/bpmn/infrastructure/PropertiesPanelStateRepository";
import { WebviewMessageRouter } from "@miragon/bpmn-modeler-core";
import { registerWebviewLogHandlers } from "@miragon/bpmn-modeler-core";
import { registerWebviewNotificationHandlers } from "@miragon/bpmn-modeler-core";
import { registerWebviewFocusHandlers } from "@miragon/bpmn-modeler-core";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";
import { documentFlushedHandler } from "@miragon/bpmn-modeler-core";
import { BpmnClipboardMediator } from "@miragon/bpmn-modeler-core";
import { BpmnElementTemplatesService } from "@miragon/bpmn-modeler-core";
import { BpmnLintConfigLocator } from "@miragon/bpmn-modeler-core";
import { BpmnLintConfigService } from "@miragon/bpmn-modeler-core";
import { BpmnLayoutService } from "@miragon/bpmn-modeler-core";
import { BpmnPropertiesPanelService } from "@miragon/bpmn-modeler-core";
import { BpmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";
import { displayDocumentHandler, DocumentRenderParticipant } from "@miragon/bpmn-modeler-core";
import { ModelNavigationService } from "@miragon/bpmn-modeler-core";
import { ReferencedModelLocator } from "@miragon/bpmn-modeler-core";
import { ModelerEditorController } from "../modeler/editor-session/ModelerEditorController";
import {
    FocusLintElementController,
    FOCUS_LINT_ELEMENT_CMD,
} from "../modeler/bpmn/controller/FocusLintElementController";
import {
    BpmnlintParticipant,
    BpmnSettingsParticipant,
    CachedTemplateProvider,
    DefinitionSearchParticipant,
    EditorSessionParticipant,
    ElementTemplatesParticipant,
    EngineVersionStatusBarParticipant,
    FormReferenceStatusParticipant,
    NodeBpmnLinter,
} from "@miragon/bpmn-modeler-core";
import { VsCodeDiagnostics } from "../shared/infrastructure/VsCodeDiagnostics";
import { ScriptTaskTeardownParticipant } from "../modeler/bpmn/controller/editor-participants/ScriptTaskTeardownParticipant";
import {
    cleanupReportHandler,
    diagramFormattedHandler,
    getBpmnlintConfigHandler,
    getBpmnModelerSettingHandler,
    getClipboardHandler,
    getElementTemplatesHandler,
    getFormReferenceStatusHandler,
    getPropertiesPanelStateHandler,
    getTextClipboardHandler,
    navigateToImplementationHandler,
    navigateToReferencedModelHandler,
    searchWorkspaceDefinitionsHandler,
    setClipboardHandler,
    setPropertiesPanelStateHandler,
    setTextClipboardHandler,
    syncActivitiesHandler,
    syncDocumentHandler,
    updateLintResultsHandler,
} from "@miragon/bpmn-modeler-core";
import {
    openScriptEditorHandler,
    openScriptEditorsHandler,
    resyncScriptTasksHandler,
    setLintingEnabledHandler,
    updateScriptSourceHandler,
    updateScriptVariablesHandler,
} from "../modeler/bpmn/controller/webview-handlers/bpmnMessageHandlers";
import { BpmnDiffController } from "../diff/controller/BpmnDiffController";
import { ScriptTaskService } from "../scriptTask/controller/ScriptTaskService";
import { BPMN_VIEW_TYPE, ScriptFileStore, ScriptVariableStore } from "@miragon/bpmn-modeler-core";
import { CodeLinkHandles } from "./codeLinkFeature";
import { SharedDeps } from "./sharedDeps";
import { FormReferenceStatusService } from "../navigation";
import { DefinitionSearchService, WorkspaceDefinitionIndex } from "../definitionSearch";

/**
 * Lifecycle-bearing collaborators owned by sibling features that the editor
 * routes into: the diff controller decides whether a resolved pane is a diff
 * view, the script-task service handles inline-editor messages and teardown,
 * the variable store feeds script completion, the script file store names the
 * folder "Generate Script Files" wrote into, and the code-link handles carry
 * go-to-implementation navigation, the always-on activity→code map, and its
 * teardown participant.
 */
interface EditorHandles {
    diffController: BpmnDiffController;
    scriptTaskSvc: ScriptTaskService;
    scriptVariableStore: ScriptVariableStore;
    scriptFiles: ScriptFileStore;
    codeLink: CodeLinkHandles;
    marketplaceSvc: CachedTemplateProvider;
    deploymentStatusParticipant: EditorSessionParticipant;
}

/**
 * The BPMN editor feature owns the BPMN custom-editor controller and all the
 * per-document services and the message router behind it. Model-navigation
 * is constructed here because only the BPMN router consumes it; go-to-
 * implementation and the activity→code map arrive as code-link handles so the
 * locator is shared and the source-file watcher's lifetime is owned in one
 * place. `bpmnService` is returned because the command feature reuses it for
 * batch operations, and the router's routes for the coverage spec.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: EditorHandles,
): {
    bpmnService: BpmnModelerService;
    templatesSvc: BpmnElementTemplatesService;
    layoutSvc: BpmnLayoutService;
    editorRoutes: Pick<WebviewMessageRouter, "routeOf">;
} {
    const {
        diffController,
        scriptTaskSvc,
        scriptVariableStore,
        scriptFiles,
        codeLink,
        marketplaceSvc,
        deploymentStatusParticipant,
    } = handles;

    const panelStateRepo = new PropertiesPanelStateRepository(context);
    const bpmnService = new BpmnModelerService(
        deps.editorStore,
        deps.vsDocument,
        deps.picker,
        deps.statusBar,
        deps.notifier,
        deps.vsSettings,
    );
    const templatesSvc = new BpmnElementTemplatesService(
        deps.editorStore,
        deps.vsDocument,
        deps.artifactSvc,
        deps.statusBar,
        deps.notifier,
        marketplaceSvc,
    );
    context.subscriptions.push({ dispose: () => templatesSvc.dispose() });
    const lintConfigLocator = new BpmnLintConfigLocator(
        deps.vsWorkspace,
        deps.vsSettings,
        deps.artifactSvc,
    );
    const lintConfigSvc = new BpmnLintConfigService(
        deps.editorStore,
        deps.vsDocument,
        lintConfigLocator,
        new NodeBpmnLinter(),
        new VsCodeDiagnostics(FOCUS_LINT_ELEMENT_CMD),
        deps.statusBar,
        deps.notifier,
        deps.vsSettings,
    );
    const clipboardMediator = new BpmnClipboardMediator(
        deps.editorStore,
        deps.clipboard,
        deps.notifier,
    );
    const settingsBroadcaster = new BpmnSettingsBroadcaster(
        deps.editorStore,
        deps.vsSettings,
        deps.notifier,
    );
    const layoutSvc = new BpmnLayoutService(deps.editorStore, deps.notifier, deps.picker);
    const panelSvc = new BpmnPropertiesPanelService(
        deps.editorStore,
        panelStateRepo,
        deps.notifier,
    );
    const referencedModelLocator = new ReferencedModelLocator(deps.vsWorkspace, deps.notifier);
    const modelNavigationService = new ModelNavigationService(
        referencedModelLocator,
        deps.notifier,
        deps.picker,
    );
    const formReferenceStatusService = new FormReferenceStatusService(
        deps.editorStore,
        deps.vsDocument,
        deps.vsWorkspace,
        referencedModelLocator,
        deps.notifier,
    );
    context.subscriptions.push({ dispose: () => formReferenceStatusService.dispose() });
    const definitionIndex = new WorkspaceDefinitionIndex(deps.vsWorkspace, deps.notifier);
    const definitionSearchService = new DefinitionSearchService(
        deps.editorStore,
        deps.vsDocument,
        deps.vsWorkspace,
        definitionIndex,
        deps.notifier,
    );
    context.subscriptions.push({ dispose: () => definitionIndex.dispose() });

    // `GetBpmnModelerSettingCommand` registers two handlers, run in order:
    // broadcast settings/language, then resync scripts edited while hidden.
    const bpmnMessageRouter = new WebviewMessageRouter()
        .on(
            "GetBpmnFileCommand",
            displayDocumentHandler(bpmnService, deps.notifier, "Bpmn modeler is ready"),
        )
        .on("GetElementTemplatesCommand", getElementTemplatesHandler(templatesSvc))
        .on("GetBpmnlintConfigCommand", getBpmnlintConfigHandler(lintConfigSvc))
        .on("GetBpmnModelerSettingCommand", getBpmnModelerSettingHandler(settingsBroadcaster))
        .on("GetBpmnModelerSettingCommand", resyncScriptTasksHandler(scriptTaskSvc))
        .on("SetLintingEnabledCommand", setLintingEnabledHandler())
        .on("UpdateLintResultsCommand", updateLintResultsHandler(lintConfigSvc))
        .on("GetPropertiesPanelStateCommand", getPropertiesPanelStateHandler(panelSvc))
        .on("SetPropertiesPanelStateCommand", setPropertiesPanelStateHandler(panelSvc))
        .on("GetClipboardCommand", getClipboardHandler(clipboardMediator))
        .on("SetClipboardCommand", setClipboardHandler(clipboardMediator))
        .on("GetTextClipboardCommand", getTextClipboardHandler(clipboardMediator))
        .on("SetTextClipboardCommand", setTextClipboardHandler(clipboardMediator))
        .on("SyncDocumentCommand", syncDocumentHandler(bpmnService))
        .on("DiagramFormattedCommand", diagramFormattedHandler(layoutSvc))
        .on("CleanupReportCommand", cleanupReportHandler(layoutSvc))
        .on("DocumentFlushedCommand", documentFlushedHandler(deps.flushSvc))
        .on(
            "OpenScriptEditorCommand",
            openScriptEditorHandler(scriptTaskSvc, scriptVariableStore, deps.notifier),
        )
        .on(
            "OpenScriptEditorsCommand",
            openScriptEditorsHandler(
                scriptTaskSvc,
                scriptVariableStore,
                scriptFiles,
                deps.notifier,
            ),
        )
        .on("UpdateScriptVariablesCommand", updateScriptVariablesHandler(scriptVariableStore))
        .on("UpdateScriptSourceCommand", updateScriptSourceHandler(scriptTaskSvc))
        .on(
            "NavigateToReferencedModelCommand",
            navigateToReferencedModelHandler(
                deps.editorStore,
                modelNavigationService,
                deps.notifier,
            ),
        )
        .on(
            "NavigateToImplementationCommand",
            navigateToImplementationHandler(
                deps.editorStore,
                codeLink.implementationNavigation,
                deps.notifier,
            ),
        )
        .on("SyncActivitiesCommand", syncActivitiesHandler(codeLink.codeLinkMap));
    bpmnMessageRouter.on(
        "GetFormReferenceStatusCommand",
        getFormReferenceStatusHandler(formReferenceStatusService),
    );
    bpmnMessageRouter.on(
        "SearchWorkspaceDefinitionsCommand",
        searchWorkspaceDefinitionsHandler(definitionSearchService),
    );
    // Tags forwarded webview log lines with the diagram's basename so a warning
    // can be correlated to a file when several editors are open. getFilePath
    // throws for an editorId the store no longer tracks; a bare `[webview]` tag
    // is better than dropping the line.
    const resolveSource = (editorId: string): string | undefined => {
        try {
            return basename(deps.vsDocument.getFilePath(editorId));
        } catch {
            return undefined;
        }
    };

    // Route the webview's own Log*Commands into the output channel; without this
    // the router drops them as unknown types and webview diagnostics never surface.
    registerWebviewLogHandlers(bpmnMessageRouter, deps.notifier, resolveSource);
    registerWebviewNotificationHandlers(bpmnMessageRouter, deps.notifier);
    registerWebviewFocusHandlers(bpmnMessageRouter, deps.editorStore);

    new ModelerEditorController(deps.editorStore, deps.notifier, {
        viewType: BPMN_VIEW_TYPE,
        messageRouter: bpmnMessageRouter,
        participants: [
            new DocumentRenderParticipant(bpmnService, ".bpmn", deps.notifier),
            new FormReferenceStatusParticipant(formReferenceStatusService),
            new DefinitionSearchParticipant(definitionSearchService),
            new ElementTemplatesParticipant(templatesSvc, deps.artifactSvc, deps.notifier),
            new BpmnlintParticipant(
                lintConfigSvc,
                lintConfigLocator,
                deps.statusBar,
                deps.notifier,
            ),
            new BpmnSettingsParticipant(settingsBroadcaster),
            new EngineVersionStatusBarParticipant(deps.statusBar, deps.vsDocument),
            deploymentStatusParticipant,
            new ScriptTaskTeardownParticipant(scriptTaskSvc, scriptVariableStore),
            codeLink.codeLinkParticipant,
        ],
        // Diff routing: when the URI resolves as a diff pane the diff controller
        // owns it, so signal "handled" and skip editor-session creation.
        delegateResolve: (document, panel) => {
            if (!diffController.shouldResolveAsDiff(document.uri)) {
                return false;
            }
            diffController.resolveDiffPane(panel, document);
            return true;
        },
        initialPanelVisible: () => panelSvc.getPersistedPanelVisibility(),
    }).register(context);

    // Turns each element-specific bpmnlint diagnostic into a click-to-centre
    // action; the diagnostics carry a command link to this controller.
    new FocusLintElementController(deps.editorStore, deps.notifier).register(context);

    deps.pendingEdits.serve(".bpmn", bpmnService);

    return { bpmnService, templatesSvc, layoutSvc, editorRoutes: bpmnMessageRouter };
}
