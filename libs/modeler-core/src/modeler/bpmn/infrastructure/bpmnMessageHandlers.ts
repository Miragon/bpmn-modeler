import {
    CleanupReportCommand,
    Command,
    DiagramFormattedCommand,
    SetClipboardCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    UpdateLintResultsCommand,
} from "@miragon/bpmn-modeler-shared";

import { MessageHandler } from "../../../shared/infrastructure/WebviewMessageRouter";
import { BpmnClipboardMediator } from "../service/BpmnClipboardMediator";
import { BpmnElementTemplatesService } from "../service/BpmnElementTemplatesService";
import { BpmnLayoutService } from "../service/BpmnLayoutService";
import { BpmnLintConfigService } from "../service/BpmnLintConfigService";
import { BpmnPropertiesPanelService } from "../service/BpmnPropertiesPanelService";
import { BpmnSettingsBroadcaster } from "../service/BpmnSettingsBroadcaster";

// Factories that turn a BPMN-webview command into a call on the owning service,
// registered on each host's WebviewMessageRouter. A handler awaits its service
// so a rejection reaches the router's dispatch and is logged there.

/** `GetElementTemplatesCommand` → push the configured element templates. */
export function getElementTemplatesHandler(
    templatesSvc: BpmnElementTemplatesService,
): MessageHandler {
    // Await (not fire-and-forget) so a rejection propagates to the router's
    // dispatch catch (the session lifecycle) instead of floating off unlogged.
    return async (_message: Command, editorId: string) => {
        await templatesSvc.setElementTemplates(editorId);
    };
}

/**
 * `GetBpmnlintConfigCommand` → discover and push the nearest `.bpmnlintrc`.
 */
export function getBpmnlintConfigHandler(lintSvc: BpmnLintConfigService): MessageHandler {
    return async (_message: Command, editorId: string) => {
        await lintSvc.setBpmnlintConfig(editorId);
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
    // Preserve the original settings-then-language post order (settingsPromise is
    // started first), but await settings so its rejection reaches the router's
    // dispatch catch. setLanguage owns its own error handling and stays floating.
    return async (_message: Command, editorId: string) => {
        const settingsPromise = settingsBroadcaster.setSettings(editorId);
        settingsBroadcaster.setLanguage(editorId);
        await settingsPromise;
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

/**
 * `UpdateLintResultsCommand` → feed the host's Problems panel + status bar from
 * findings the webview computed in its in-page default run. The
 * service ignores the push when the editor is no longer on the in-page path (a
 * workspace-config takeover) or when linting is disabled.
 */
export function updateLintResultsHandler(
    lintSvc: BpmnLintConfigService,
): MessageHandler<UpdateLintResultsCommand> {
    return (cmd, editorId) => {
        lintSvc.applyWebviewLintResults(editorId, cmd.results, cmd.unresolved, cmd.configToken);
    };
}

/** `SetPropertiesPanelStateCommand` → persist the panel visibility. */
export function setPropertiesPanelStateHandler(
    panelSvc: BpmnPropertiesPanelService,
): MessageHandler<SetPropertiesPanelStateCommand> {
    return (message) => {
        panelSvc.setPropertiesPanelVisibility(message.visible);
    };
}

/** `GetClipboardCommand` → read the structured clipboard back to the webview. */
export function getClipboardHandler(clipboardMediator: BpmnClipboardMediator): MessageHandler {
    return (_message: Command, editorId: string) => {
        clipboardMediator.readClipboard(editorId);
    };
}

/** `SetClipboardCommand` → write the structured clipboard payload. */
export function setClipboardHandler(
    clipboardMediator: BpmnClipboardMediator,
): MessageHandler<SetClipboardCommand> {
    return (message) => {
        clipboardMediator.writeClipboard(message.text);
    };
}

/** `GetTextClipboardCommand` → read the OS text clipboard back to the webview. */
export function getTextClipboardHandler(clipboardMediator: BpmnClipboardMediator): MessageHandler {
    return (_message: Command, editorId: string) => {
        clipboardMediator.readTextClipboard(editorId);
    };
}

/** `SetTextClipboardCommand` → write the OS text clipboard. */
export function setTextClipboardHandler(
    clipboardMediator: BpmnClipboardMediator,
): MessageHandler<SetTextClipboardCommand> {
    return (message) => {
        clipboardMediator.writeClipboard(message.text);
    };
}

/** `DiagramFormattedCommand` → surface the outcome of a format attempt. */
export function diagramFormattedHandler(
    layoutSvc: BpmnLayoutService,
): MessageHandler<DiagramFormattedCommand> {
    return (message) => {
        layoutSvc.reportFormatted(message);
    };
}

/** `CleanupReportCommand` → confirm the findings, then ask for them to be applied. */
export function cleanupReportHandler(
    layoutSvc: BpmnLayoutService,
): MessageHandler<CleanupReportCommand> {
    return async (message, editorId) => {
        await layoutSvc.reportCleanup(message, editorId);
    };
}
