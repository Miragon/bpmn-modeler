import { basename } from "node:path";

import { ExtensionContext } from "vscode";

import { PropertiesPanelStateRepository } from "../modeler/bpmn/adapter/out/PropertiesPanelStateRepository";
import { RouteLookup, WebviewMessageRouter } from "@miragon/bpmn-modeler-core";
import { registerWebviewLogHandlers } from "@miragon/bpmn-modeler-core";
import { registerWebviewNotificationHandlers } from "@miragon/bpmn-modeler-core";
import { registerWebviewFocusHandlers } from "@miragon/bpmn-modeler-core";
import { documentFlushedHandler } from "@miragon/bpmn-modeler-core";
import { BpmnPropertiesPanelService } from "@miragon/bpmn-modeler-core";
import { DmnModelerService } from "@miragon/bpmn-modeler-core";
import { DmnSettingsBroadcaster, DmnSettingsParticipant } from "@miragon/bpmn-modeler-core";
import {
    displayDocumentHandler,
    DocumentRenderParticipant,
    getDmnModelerSettingHandler,
} from "@miragon/bpmn-modeler-core";
import { FormModelerService } from "@miragon/bpmn-modeler-core";
import { FormEngineStatusBarParticipant, JsonFormTextEdits } from "@miragon/bpmn-modeler-core";
import { ModelerEditorController } from "../modeler/editor-session/adapter/in/ModelerEditorController";
import { DocumentSaveFlushController } from "../modeler/editor-session/adapter/in/DocumentSaveFlushController";
import { FormValuesParticipant } from "../modeler/form/adapter/in/editor-participants/FormValuesParticipant";
import { FormValuesController } from "../modeler/form/adapter/in/FormValuesController";
import {
    getPropertiesPanelStateHandler,
    setPropertiesPanelStateHandler,
    syncDocumentHandler,
} from "@miragon/bpmn-modeler-core";
import {
    getFormInputValuesHandler,
    updateFormOutputValuesHandler,
} from "../modeler/form/adapter/in/webview-handlers/formMessageHandlers";
import { DMN_VIEW_TYPE, FORM_VIEW_TYPE } from "@miragon/bpmn-modeler-core";
import { DiffController } from "../diff/adapter/in/DiffController";
import { SharedDeps } from "./sharedDeps";

/**
 * The editor feature owns the DMN and Form custom-editor controllers, the
 * per-document services and message routers behind them, and the save flush
 * that every editor format shares. The BPMN editor is `bpmnEditorFeature`'s.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
    handles: { dmnDiffController: DiffController },
): {
    dmnEditorRoutes: RouteLookup;
    formEditorRoutes: RouteLookup;
    formService: FormModelerService;
} {
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
    const formService = new FormModelerService(deps.editorStore, deps.vsDocument, deps.notifier, {
        picker: deps.picker,
        pendingEdits: deps.pendingEdits,
        textEdits: new JsonFormTextEdits(),
    });
    const formValues = new FormValuesController(deps.editorStore, deps.notifier);
    formValues.register(context);
    const dmnSettingsBroadcaster = new DmnSettingsBroadcaster(
        deps.editorStore,
        deps.vsSettings,
        deps.notifier,
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

    const dmnMessageRouter = new WebviewMessageRouter()
        .on(
            "GetDmnFileCommand",
            displayDocumentHandler(dmnService, deps.notifier, "Dmn modeler is ready"),
        )
        .on("GetDmnModelerSettingCommand", getDmnModelerSettingHandler(dmnSettingsBroadcaster))
        .on("GetPropertiesPanelStateCommand", getPropertiesPanelStateHandler(dmnPanelSvc))
        .on("SetPropertiesPanelStateCommand", setPropertiesPanelStateHandler(dmnPanelSvc))
        .on("SyncDocumentCommand", syncDocumentHandler(dmnService))
        .on("DocumentFlushedCommand", documentFlushedHandler(deps.flushSvc));
    registerWebviewLogHandlers(dmnMessageRouter, deps.notifier, resolveSource);
    registerWebviewNotificationHandlers(dmnMessageRouter, deps.notifier);
    registerWebviewFocusHandlers(dmnMessageRouter, deps.editorStore);
    const formMessageRouter = new WebviewMessageRouter()
        .on(
            "GetFormFileCommand",
            displayDocumentHandler(formService, deps.notifier, "Form editor is ready"),
        )
        .on("GetFormInputValuesCommand", getFormInputValuesHandler(formValues))
        .on("UpdateFormOutputValuesCommand", updateFormOutputValuesHandler(formValues))
        .on("SyncDocumentCommand", syncDocumentHandler(formService))
        .on("DocumentFlushedCommand", documentFlushedHandler(deps.flushSvc));
    registerWebviewLogHandlers(formMessageRouter, deps.notifier, resolveSource);
    registerWebviewNotificationHandlers(formMessageRouter, deps.notifier);

    new ModelerEditorController(deps.editorStore, deps.notifier, deps.createEditorHandle, {
        viewType: DMN_VIEW_TYPE,
        messageRouter: dmnMessageRouter,
        participants: [
            new DocumentRenderParticipant(dmnService, ".dmn", deps.notifier),
            new DmnSettingsParticipant(dmnSettingsBroadcaster),
        ],
        delegateResolve: handles.dmnDiffController.resolveWhenDiffPane,
        initialPanelVisible: () => dmnPanelSvc.getPersistedPanelVisibility(),
    }).register(context);
    new ModelerEditorController(deps.editorStore, deps.notifier, deps.createEditorHandle, {
        viewType: FORM_VIEW_TYPE,
        messageRouter: formMessageRouter,
        participants: [
            new DocumentRenderParticipant(formService, ".form", deps.notifier),
            new FormEngineStatusBarParticipant(
                deps.statusBar,
                deps.vsDocument,
                deps.engineVersionOwnership,
            ),
            new FormValuesParticipant(formValues),
        ],
    }).register(context);

    deps.pendingEdits.serve(".dmn", dmnService);
    deps.pendingEdits.serve(".form", formService);
    // Flush pending webview changes into the buffer before every save so a
    // persist never trails the live model.
    new DocumentSaveFlushController(deps.editorStore, deps.pendingEdits).register(context);

    return { dmnEditorRoutes: dmnMessageRouter, formEditorRoutes: formMessageRouter, formService };
}
