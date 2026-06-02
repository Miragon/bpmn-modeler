import {
    Command,
    OpenScriptEditorCommand,
    NavigateToReferencedModelCommand,
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncDocumentCommand,
} from "@miragon/bpmn-modeler-shared";

import { EditorSessionStore } from "../../../../shared/infrastructure/EditorSessionStore";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { MessageHandler } from "../../../../shared/infrastructure/WebviewMessageRouter";
import { BpmnModelerService } from "../../service/BpmnModelerService";
import { BpmnClipboardMediator } from "../../service/BpmnClipboardMediator";
import { BpmnElementTemplatesService } from "../../service/BpmnElementTemplatesService";
import { BpmnPropertiesPanelService } from "../../service/BpmnPropertiesPanelService";
import { BpmnSettingsBroadcaster } from "../../service/BpmnSettingsBroadcaster";
import { ModelNavigationService } from "../../../../navigation/index";
import { ScriptTaskService } from "../../../../scriptTask/index";

/**
 * Factories that turn a transport-level webview {@link Command} into a call on
 * the owning service. Each takes only the service(s) it needs so handlers can
 * be unit-tested without constructing the whole editor controller; they are
 * registered against a {@link WebviewMessageRouter} in `main.ts`.
 *
 * Grouped by feature so they move together when features become folders.
 */

/** `GetBpmnFileCommand` → render the diagram, logging readiness on success. */
export function getBpmnFileHandler(
    bpmnService: BpmnModelerService,
    notifier: VsCodeNotifier,
): MessageHandler {
    return async (_message: Command, editorId: string) => {
        if (await bpmnService.display(editorId)) {
            notifier.logInfo("Bpmn modeler is ready");
        }
    };
}

/** `GetElementTemplatesCommand` → push the configured element templates. */
export function getElementTemplatesHandler(
    templatesSvc: BpmnElementTemplatesService,
): MessageHandler {
    return (_message: Command, editorId: string) => {
        templatesSvc.setElementTemplates(editorId);
    };
}

/**
 * `GetBpmnModelerSettingCommand` → broadcast settings and language.
 *
 * Paired in registration order with {@link resyncScriptTasksHandler}: the
 * webview re-requests settings on (re)load, which is also the moment to reload
 * inline scripts that changed while it was hidden.
 */
export function getBpmnModelerSettingHandler(
    settingsBroadcaster: BpmnSettingsBroadcaster,
): MessageHandler {
    return (_message: Command, editorId: string) => {
        settingsBroadcaster.setSettings(editorId);
        settingsBroadcaster.setLanguage(editorId);
    };
}

/** Second handler for `GetBpmnModelerSettingCommand`: reload scripts edited while hidden. */
export function resyncScriptTasksHandler(scriptTaskSvc: ScriptTaskService): MessageHandler {
    return (_message: Command, editorId: string) => {
        scriptTaskSvc.resyncOpenDocuments(editorId);
    };
}

/** `GetPropertiesPanelStateCommand` → send the persisted panel visibility. */
export function getPropertiesPanelStateHandler(
    panelSvc: BpmnPropertiesPanelService,
): MessageHandler {
    return (_message: Command, editorId: string) => {
        panelSvc.sendPropertiesPanelState(editorId);
    };
}

/** `SetPropertiesPanelStateCommand` → persist the panel visibility. */
export function setPropertiesPanelStateHandler(
    panelSvc: BpmnPropertiesPanelService,
): MessageHandler {
    return (message: Command) => {
        panelSvc.setPropertiesPanelVisibility((message as SetPropertiesPanelStateCommand).visible);
    };
}

/** `GetClipboardCommand` → read the structured clipboard back to the webview. */
export function getClipboardHandler(clipboardMediator: BpmnClipboardMediator): MessageHandler {
    return (_message: Command, editorId: string) => {
        clipboardMediator.readClipboard(editorId);
    };
}

/** `SetClipboardCommand` → write the structured clipboard payload. */
export function setClipboardHandler(clipboardMediator: BpmnClipboardMediator): MessageHandler {
    return (message: Command) => {
        clipboardMediator.writeClipboard((message as SetClipboardCommand).text);
    };
}

/** `GetTextClipboardCommand` → read the OS text clipboard back to the webview. */
export function getTextClipboardHandler(clipboardMediator: BpmnClipboardMediator): MessageHandler {
    return (_message: Command, editorId: string) => {
        clipboardMediator.readTextClipboard(editorId);
    };
}

/** `SetTextClipboardCommand` → write the OS text clipboard. */
export function setTextClipboardHandler(clipboardMediator: BpmnClipboardMediator): MessageHandler {
    return (message: Command) => {
        clipboardMediator.writeClipboard((message as SetTextClipboardCommand).text);
    };
}

/** `SyncDocumentCommand` → persist the current XML; session guard lives in the service. */
export function syncDocumentHandler(bpmnService: BpmnModelerService): MessageHandler {
    return async (message: Command, editorId: string) => {
        await bpmnService.sync(editorId, (message as SyncDocumentCommand).content);
    };
}

/** `OpenScriptEditorCommand` → open the inline script in a virtual editor. */
export function openScriptEditorHandler(scriptTaskSvc: ScriptTaskService): MessageHandler {
    return async (message: Command, editorId: string) => {
        const cmd = message as OpenScriptEditorCommand;
        await scriptTaskSvc.openScriptEditor(
            editorId,
            cmd.elementId,
            cmd.kind,
            cmd.listenerIndex,
            cmd.eventName,
            cmd.scriptFormat,
            cmd.content,
        );
    };
}

/**
 * `NavigateToReferencedModelCommand` → jump to the referenced process/decision.
 *
 * Defence-in-depth: an unknown discriminant is rejected with a warning rather
 * than falling through, so a malformed/hostile message can't be treated as a
 * decision navigation by default.
 */
export function navigateToReferencedModelHandler(
    editorStore: EditorSessionStore,
    modelNavigationService: ModelNavigationService,
    notifier: VsCodeNotifier,
): MessageHandler {
    return async (message: Command, editorId: string) => {
        const cmd = message as NavigateToReferencedModelCommand;
        if (cmd.referenceKind !== "process" && cmd.referenceKind !== "decision") {
            notifier.logWarning(
                `Ignoring NavigateToReferencedModelCommand with unknown kind: ${String(
                    cmd.referenceKind,
                )}`,
            );
            return;
        }
        const sourceFsPath = editorStore.requireHandle(editorId).documentFsPath();
        await modelNavigationService.navigate(cmd.referenceId, cmd.referenceKind, sourceFsPath);
    };
}
