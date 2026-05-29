import { ExtensionContext } from "vscode";

import { PropertiesPanelStateRepository } from "../modeler/bpmn/infrastructure/PropertiesPanelStateRepository";
import { WebviewMessageRouter } from "../shared/infrastructure/WebviewMessageRouter";
import { BpmnModelerService } from "../modeler/bpmn/service/BpmnModelerService";
import { BpmnClipboardMediator } from "../modeler/bpmn/service/BpmnClipboardMediator";
import { BpmnElementTemplatesService } from "../modeler/bpmn/service/BpmnElementTemplatesService";
import { BpmnPropertiesPanelService } from "../modeler/bpmn/service/BpmnPropertiesPanelService";
import { BpmnSettingsBroadcaster } from "../modeler/bpmn/service/BpmnSettingsBroadcaster";
import { DmnModelerService } from "../modeler/dmn/service/DmnModelerService";
import { ModelNavigationService } from "../navigation/service/ModelNavigationService";
import { ReferencedModelLocator } from "../navigation/service/ReferencedModelLocator";
import { ModelerEditorController } from "../modeler/editor-session/ModelerEditorController";
import { BpmnRenderParticipant } from "../modeler/bpmn/controller/editor-participants/BpmnRenderParticipant";
import { ElementTemplatesParticipant } from "../modeler/bpmn/controller/editor-participants/ElementTemplatesParticipant";
import { SettingsParticipant } from "../modeler/bpmn/controller/editor-participants/SettingsParticipant";
import { EngineVersionStatusBarParticipant } from "../modeler/bpmn/controller/editor-participants/EngineVersionStatusBarParticipant";
import { ScriptTaskTeardownParticipant } from "../modeler/bpmn/controller/editor-participants/ScriptTaskTeardownParticipant";
import { DmnRenderParticipant } from "../modeler/dmn/controller/editor-participants/DmnRenderParticipant";
import {
    getBpmnFileHandler,
    getElementTemplatesHandler,
    getBpmnModelerSettingHandler,
    resyncScriptTasksHandler,
    getPropertiesPanelStateHandler,
    setPropertiesPanelStateHandler,
    getClipboardHandler,
    setClipboardHandler,
    getTextClipboardHandler,
    setTextClipboardHandler,
    syncDocumentHandler,
    openScriptEditorHandler,
    navigateToReferencedModelHandler,
} from "../modeler/bpmn/controller/webview-handlers/bpmnMessageHandlers";
import {
    getDmnFileHandler,
    syncDmnDocumentHandler,
} from "../modeler/dmn/controller/webview-handlers/dmnMessageHandlers";
import { BpmnDiffController } from "../diff/controller/BpmnDiffController";
import { ScriptTaskService } from "../scriptTask/controller/ScriptTaskService";
import { SharedDeps } from "./sharedDeps";

/**
 * Lifecycle-bearing collaborators owned by sibling features that the editor
 * routes into: the diff controller decides whether a resolved pane is a diff
 * view, and the script-task service handles inline-editor messages and teardown.
 */
interface EditorHandles {
    diffController: BpmnDiffController;
    scriptTaskSvc: ScriptTaskService;
}

/**
 * The editor feature owns both custom-editor controllers (BPMN and DMN) and all
 * the per-document services and message routers behind them. `modelNavigation`
 * and `referencedModelLocator` live here — not in a separate feature — because
 * only the BPMN router consumes them. `bpmnService` is returned because the
 * command feature reuses it for batch operations.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: EditorHandles,
): { bpmnService: BpmnModelerService } {
    const { diffController, scriptTaskSvc } = handles;

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
    const dmnService = new DmnModelerService(deps.editorStore, deps.vsDocument, deps.notifier);
    const referencedModelLocator = new ReferencedModelLocator(deps.vsWorkspace, deps.notifier);
    const modelNavigationService = new ModelNavigationService(
        referencedModelLocator,
        deps.notifier,
        deps.picker,
    );

    // One router per editor: both protocols carry `SyncDocumentCommand` but
    // route it to a different service, so they cannot share a dispatch table.
    // `GetBpmnModelerSettingCommand` registers two handlers, run in order:
    // broadcast settings/language, then resync scripts edited while hidden.
    const bpmnMessageRouter = new WebviewMessageRouter()
        .on("GetBpmnFileCommand", getBpmnFileHandler(bpmnService, deps.notifier))
        .on("GetElementTemplatesCommand", getElementTemplatesHandler(templatesSvc))
        .on("GetBpmnModelerSettingCommand", getBpmnModelerSettingHandler(settingsBroadcaster))
        .on("GetBpmnModelerSettingCommand", resyncScriptTasksHandler(scriptTaskSvc))
        .on("GetPropertiesPanelStateCommand", getPropertiesPanelStateHandler(panelSvc))
        .on("SetPropertiesPanelStateCommand", setPropertiesPanelStateHandler(panelSvc))
        .on("GetClipboardCommand", getClipboardHandler(clipboardMediator))
        .on("SetClipboardCommand", setClipboardHandler(clipboardMediator))
        .on("GetTextClipboardCommand", getTextClipboardHandler(clipboardMediator))
        .on("SetTextClipboardCommand", setTextClipboardHandler(clipboardMediator))
        .on("SyncDocumentCommand", syncDocumentHandler(bpmnService))
        .on("OpenScriptEditorCommand", openScriptEditorHandler(scriptTaskSvc))
        .on(
            "NavigateToReferencedModelCommand",
            navigateToReferencedModelHandler(
                deps.editorStore,
                modelNavigationService,
                deps.notifier,
            ),
        );
    const dmnMessageRouter = new WebviewMessageRouter()
        .on("GetDmnFileCommand", getDmnFileHandler(dmnService, deps.notifier))
        .on("SyncDocumentCommand", syncDmnDocumentHandler(dmnService));

    new ModelerEditorController(deps.editorStore, deps.notifier, {
        viewType: "bpmn-modeler.bpmn",
        messageRouter: bpmnMessageRouter,
        participants: [
            new BpmnRenderParticipant(bpmnService, deps.notifier),
            new ElementTemplatesParticipant(templatesSvc, deps.artifactSvc, deps.notifier),
            new SettingsParticipant(settingsBroadcaster),
            new EngineVersionStatusBarParticipant(deps.statusBar, deps.vsDocument),
            new ScriptTaskTeardownParticipant(scriptTaskSvc),
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
        viewType: "bpmn-modeler.dmn",
        messageRouter: dmnMessageRouter,
        participants: [new DmnRenderParticipant(dmnService, deps.notifier)],
    }).register(context);

    return { bpmnService };
}
