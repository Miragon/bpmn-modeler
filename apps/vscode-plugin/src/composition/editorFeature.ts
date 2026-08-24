import { basename } from "node:path";

import { ExtensionContext } from "vscode";

import { PropertiesPanelStateRepository } from "../modeler/bpmn/infrastructure/PropertiesPanelStateRepository";
import { WebviewMessageRouter } from "@miragon/bpmn-modeler-core";
import { registerWebviewLogHandlers } from "@miragon/bpmn-modeler-core";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";
import { DocumentFlushService, documentFlushedHandler } from "@miragon/bpmn-modeler-core";
import { BpmnClipboardMediator } from "@miragon/bpmn-modeler-core";
import { BpmnElementTemplatesService } from "@miragon/bpmn-modeler-core";
import { BpmnLintConfigLocator } from "@miragon/bpmn-modeler-core";
import { BpmnLintConfigService } from "@miragon/bpmn-modeler-core";
import { DefaultBpmnlintConfigService } from "@miragon/bpmn-modeler-core";
import { BpmnPropertiesPanelService } from "@miragon/bpmn-modeler-core";
import { BpmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";
import { DmnModelerService } from "@miragon/bpmn-modeler-core";
import { DmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";
import { FormModelerService } from "@miragon/bpmn-modeler-core";
import { ModelNavigationService } from "@miragon/bpmn-modeler-core";
import { ReferencedModelLocator } from "@miragon/bpmn-modeler-core";
import { ModelerEditorController } from "../modeler/editor-session/ModelerEditorController";
import { DocumentSaveFlushController } from "../modeler/editor-session/DocumentSaveFlushController";
import {
    FocusLintElementController,
    FOCUS_LINT_ELEMENT_CMD,
} from "../modeler/bpmn/controller/FocusLintElementController";
import { NodeBpmnLinter } from "@miragon/bpmn-modeler-core";
import { VsCodeDiagnostics } from "../shared/infrastructure/VsCodeDiagnostics";
import { BpmnRenderParticipant } from "../modeler/bpmn/controller/editor-participants/BpmnRenderParticipant";
import { ElementTemplatesParticipant } from "../modeler/bpmn/controller/editor-participants/ElementTemplatesParticipant";
import { BpmnlintParticipant } from "../modeler/bpmn/controller/editor-participants/BpmnlintParticipant";
import { SettingsParticipant } from "../modeler/bpmn/controller/editor-participants/SettingsParticipant";
import { EngineVersionStatusBarParticipant } from "../modeler/bpmn/controller/editor-participants/EngineVersionStatusBarParticipant";
import { ScriptTaskTeardownParticipant } from "../modeler/bpmn/controller/editor-participants/ScriptTaskTeardownParticipant";
import { ScriptManifestParticipant } from "../modeler/bpmn/controller/editor-participants/ScriptManifestParticipant";
import { DmnRenderParticipant } from "../modeler/dmn/controller/editor-participants/DmnRenderParticipant";
import { DmnSettingsParticipant } from "../modeler/dmn/controller/editor-participants/DmnSettingsParticipant";
import { FormRenderParticipant } from "../modeler/form/controller/editor-participants/FormRenderParticipant";
import {
    getBpmnFileHandler,
    getElementTemplatesHandler,
    getBpmnlintConfigHandler,
    getBpmnModelerSettingHandler,
    resyncScriptTasksHandler,
    getPropertiesPanelStateHandler,
    setPropertiesPanelStateHandler,
    setLintingEnabledHandler,
    getClipboardHandler,
    setClipboardHandler,
    getTextClipboardHandler,
    setTextClipboardHandler,
    syncDocumentHandler,
    openScriptEditorHandler,
    openScriptEditorsHandler,
    updateScriptSourceHandler,
    updateScriptVariablesHandler,
    navigateToReferencedModelHandler,
    navigateToImplementationHandler,
    syncActivitiesHandler,
    getFormReferenceStatusHandler,
} from "../modeler/bpmn/controller/webview-handlers/bpmnMessageHandlers";
import {
    getDmnFileHandler,
    getDmnModelerSettingHandler,
    syncDmnDocumentHandler,
} from "../modeler/dmn/controller/webview-handlers/dmnMessageHandlers";
import {
    getFormFileHandler,
    syncFormDocumentHandler,
} from "../modeler/form/controller/webview-handlers/formMessageHandlers";
import { BpmnDiffController } from "../diff/controller/BpmnDiffController";
import { ScriptTaskService } from "../scriptTask/controller/ScriptTaskService";
import {
    BPMN_VIEW_TYPE,
    DMN_VIEW_TYPE,
    FORM_VIEW_TYPE,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";
import { TemplateMarketplaceService } from "@miragon/bpmn-modeler-core";
import { CodeLinkHandles } from "./codeLinkFeature";
import { SharedDeps } from "./sharedDeps";
import { FormReferenceStatusService } from "../navigation";
import { FormReferenceStatusParticipant } from "../navigation/controller/editor-participants/FormReferenceStatusParticipant";

/**
 * Lifecycle-bearing collaborators owned by sibling features that the editor
 * routes into: the diff controller decides whether a resolved pane is a diff
 * view, the script-task service handles inline-editor messages and teardown,
 * the variable store feeds script completion, and the code-link handles carry
 * go-to-implementation navigation, the always-on activity→code map, and its
 * teardown participant.
 */
interface EditorHandles {
    diffController: BpmnDiffController;
    scriptTaskSvc: ScriptTaskService;
    scriptVariableStore: ScriptVariableStore;
    scriptManifestParticipant: ScriptManifestParticipant;
    codeLink: CodeLinkHandles;
    marketplaceSvc: TemplateMarketplaceService;
}

/**
 * The editor feature owns both custom-editor controllers (BPMN and DMN) and all
 * the per-document services and message routers behind them. Model-navigation
 * is constructed here because only the BPMN router consumes it; go-to-
 * implementation and the activity→code map arrive as code-link handles so the
 * locator is shared and the source-file watcher's lifetime is owned in one
 * place. `bpmnService` is returned because the command feature reuses it for
 * batch operations.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: EditorHandles,
): {
    bpmnService: BpmnModelerService;
    templatesSvc: BpmnElementTemplatesService;
    documentFlush: DocumentSaveFlushController;
} {
    const {
        diffController,
        scriptTaskSvc,
        scriptVariableStore,
        scriptManifestParticipant,
        codeLink,
        marketplaceSvc,
    } = handles;

    const panelStateRepo = new PropertiesPanelStateRepository(context);
    const bpmnService = new BpmnModelerService(
        deps.editorStore,
        deps.vsDocument,
        deps.picker,
        deps.statusBar,
        deps.notifier,
    );
    const templatesSvc = new BpmnElementTemplatesService(
        deps.editorStore,
        deps.vsDocument,
        deps.artifactSvc,
        deps.statusBar,
        deps.notifier,
        marketplaceSvc,
    );
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
        new DefaultBpmnlintConfigService(),
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
    const panelSvc = new BpmnPropertiesPanelService(
        deps.editorStore,
        panelStateRepo,
        deps.notifier,
    );
    // DMN keeps its own default under a distinct key; the panel service is
    // engine-agnostic, so the BPMN implementation is reused.
    const dmnPanelStateRepo = new PropertiesPanelStateRepository(
        context,
        "dmnPropertiesPanelVisible",
    );
    const dmnPanelSvc = new BpmnPropertiesPanelService(
        deps.editorStore,
        dmnPanelStateRepo,
        deps.notifier,
    );
    const dmnService = new DmnModelerService(deps.editorStore, deps.vsDocument, deps.notifier);
    const formService = new FormModelerService(deps.editorStore, deps.vsDocument, deps.notifier);
    // One flush service for both editors: requests are keyed per editorId, so a
    // single instance behind both routers stays correct.
    const flushSvc = new DocumentFlushService(deps.editorStore, deps.notifier);
    const dmnSettingsBroadcaster = new DmnSettingsBroadcaster(
        deps.editorStore,
        deps.vsSettings,
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

    // One router per editor: both protocols carry `SyncDocumentCommand` but
    // route it to a different service, so they cannot share a dispatch table.
    // `GetBpmnModelerSettingCommand` registers two handlers, run in order:
    // broadcast settings/language, then resync scripts edited while hidden.
    const bpmnMessageRouter = new WebviewMessageRouter()
        .on("GetBpmnFileCommand", getBpmnFileHandler(bpmnService, deps.notifier))
        .on("GetElementTemplatesCommand", getElementTemplatesHandler(templatesSvc))
        .on("GetBpmnlintConfigCommand", getBpmnlintConfigHandler(lintConfigSvc))
        .on("GetBpmnModelerSettingCommand", getBpmnModelerSettingHandler(settingsBroadcaster))
        .on("GetBpmnModelerSettingCommand", resyncScriptTasksHandler(scriptTaskSvc))
        .on("SetLintingEnabledCommand", setLintingEnabledHandler())
        .on("GetPropertiesPanelStateCommand", getPropertiesPanelStateHandler(panelSvc))
        .on("SetPropertiesPanelStateCommand", setPropertiesPanelStateHandler(panelSvc))
        .on("GetClipboardCommand", getClipboardHandler(clipboardMediator))
        .on("SetClipboardCommand", setClipboardHandler(clipboardMediator))
        .on("GetTextClipboardCommand", getTextClipboardHandler(clipboardMediator))
        .on("SetTextClipboardCommand", setTextClipboardHandler(clipboardMediator))
        .on("SyncDocumentCommand", syncDocumentHandler(bpmnService))
        .on("DocumentFlushedCommand", documentFlushedHandler(flushSvc))
        .on("OpenScriptEditorCommand", openScriptEditorHandler(scriptTaskSvc, scriptVariableStore))
        .on(
            "OpenScriptEditorsCommand",
            openScriptEditorsHandler(
                scriptTaskSvc,
                scriptVariableStore,
                deps.vsSettings,
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
    const dmnMessageRouter = new WebviewMessageRouter()
        .on("GetDmnFileCommand", getDmnFileHandler(dmnService, deps.notifier))
        .on("GetDmnModelerSettingCommand", getDmnModelerSettingHandler(dmnSettingsBroadcaster))
        .on("GetPropertiesPanelStateCommand", getPropertiesPanelStateHandler(dmnPanelSvc))
        .on("SetPropertiesPanelStateCommand", setPropertiesPanelStateHandler(dmnPanelSvc))
        .on("SyncDocumentCommand", syncDmnDocumentHandler(dmnService))
        .on("DocumentFlushedCommand", documentFlushedHandler(flushSvc));
    registerWebviewLogHandlers(dmnMessageRouter, deps.notifier, resolveSource);
    const formMessageRouter = new WebviewMessageRouter()
        .on("GetFormFileCommand", getFormFileHandler(formService, deps.notifier))
        .on("SyncDocumentCommand", syncFormDocumentHandler(formService))
        .on("DocumentFlushedCommand", documentFlushedHandler(flushSvc));
    registerWebviewLogHandlers(formMessageRouter, deps.notifier, resolveSource);

    new ModelerEditorController(deps.editorStore, deps.notifier, {
        viewType: BPMN_VIEW_TYPE,
        messageRouter: bpmnMessageRouter,
        participants: [
            new BpmnRenderParticipant(bpmnService, deps.notifier),
            new FormReferenceStatusParticipant(formReferenceStatusService),
            new ElementTemplatesParticipant(templatesSvc, deps.artifactSvc, deps.notifier),
            new BpmnlintParticipant(
                lintConfigSvc,
                lintConfigLocator,
                deps.statusBar,
                deps.notifier,
            ),
            new SettingsParticipant(settingsBroadcaster),
            new EngineVersionStatusBarParticipant(deps.statusBar, deps.vsDocument),
            new ScriptTaskTeardownParticipant(scriptTaskSvc, scriptVariableStore),
            scriptManifestParticipant,
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
    new ModelerEditorController(deps.editorStore, deps.notifier, {
        viewType: DMN_VIEW_TYPE,
        messageRouter: dmnMessageRouter,
        participants: [
            new DmnRenderParticipant(dmnService, deps.notifier),
            new DmnSettingsParticipant(dmnSettingsBroadcaster),
        ],
        initialPanelVisible: () => dmnPanelSvc.getPersistedPanelVisibility(),
    }).register(context);
    new ModelerEditorController(deps.editorStore, deps.notifier, {
        viewType: FORM_VIEW_TYPE,
        messageRouter: formMessageRouter,
        participants: [new FormRenderParticipant(formService, deps.notifier)],
    }).register(context);

    // Turns each element-specific bpmnlint diagnostic into a click-to-centre
    // action; the diagnostics carry a command link to this controller.
    new FocusLintElementController(deps.editorStore, deps.notifier).register(context);

    // Flush pending webview changes into the buffer before every save so a
    // persist never trails the live model.
    const documentFlush = new DocumentSaveFlushController(
        deps.editorStore,
        flushSvc,
        bpmnService,
        dmnService,
        formService,
        deps.notifier,
    );
    documentFlush.register(context);

    return { bpmnService, templatesSvc, documentFlush };
}
