import {
    CleanupReportCommand,
    Command,
    DiagramFormattedCommand,
    ElementIdProposalsCommand,
    ElementIdReviewCommand,
    ElementIdsAppliedCommand,
    GetBpmnFileCommand,
    OpenElementIdReviewCommand,
    SetClipboardCommand,
    SetLintingEnabledCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    UpdateLintResultsCommand,
} from "@miragon/bpmn-modeler-shared";

import { answerWithoutPlugins } from "../../../../editorSession/service/answerWithoutPlugins";
import { EditorSessionStore } from "../../../../editorSession/service/EditorSessionStore";
import { MessageHandler } from "../../../../editorSession/service/WebviewMessageRouter";
import { SettingsPort } from "../../../../kernel/port/hostPorts";
import { LintingPreferencePort } from "../../port/bpmnPorts";
import { BpmnClipboardMediator } from "../../service/BpmnClipboardMediator";
import { BpmnElementTemplatesService } from "../../service/BpmnElementTemplatesService";
import { BpmnLayoutService } from "../../service/BpmnLayoutService";
import { BpmnLintConfigService } from "../../service/BpmnLintConfigService";
import { BpmnPropertiesPanelService } from "../../service/BpmnPropertiesPanelService";
import { BpmnSettingsBroadcaster } from "../../service/BpmnSettingsBroadcaster";
import { ElementIdsService } from "../../service/ElementIdsService";

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

/** `GetBpmnPluginsCommand` on a host without plugins: answer at once, so the webview does not wait. */
export function answerWithoutPluginsHandler(store: EditorSessionStore): MessageHandler {
    return async (_message: Command, editorId: string) => {
        await answerWithoutPlugins(store, editorId);
    };
}

/**
 * `GetBpmnlintConfigCommand` → discover and push the nearest `.bpmnlintrc`.
 */
export function getBpmnlintConfigHandler(lintSvc: BpmnLintConfigService): MessageHandler {
    return async (_message: Command, editorId: string) => {
        await lintSvc.answerLintConfigRequest(editorId);
    };
}

/**
 * `GetBpmnModelerSettingCommand` → broadcast settings and language.
 *
 * Runs before the script editor's resync in the BPMN editor's table: the
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

/**
 * `SetLintingEnabledCommand` → store the user's linting choice. A changed
 * choice re-lints through {@link BpmnlintParticipant}'s settings listener,
 * which pushes the new state to the webview; the webview never flips its own
 * overlays. An unchanged choice is not stored, since no host reports a
 * settings change for it, so the lint state is pushed here instead.
 */
export function setLintingEnabledHandler(
    preference: LintingPreferencePort,
    settings: SettingsPort,
    lintSvc: BpmnLintConfigService,
): MessageHandler<SetLintingEnabledCommand> {
    return async (message, editorId) => {
        // An unchanged value means the page is out of step with the stored choice.
        if (message.enabled === settings.getLintingEnabled()) {
            await lintSvc.setBpmnlintConfig(editorId);
            return;
        }
        await preference.setLintingEnabled(message.enabled);
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

/** `ElementIdProposalsCommand` → the host's review panel shows the rows. */
export function elementIdProposalsHandler(
    elementIdsSvc: ElementIdsService,
): MessageHandler<ElementIdProposalsCommand> {
    return (message, editorId) => {
        elementIdsSvc.reportProposals(editorId, message);
    };
}

/** `ElementIdsAppliedCommand` → the host's review is over. */
export function elementIdsAppliedHandler(
    elementIdsSvc: ElementIdsService,
): MessageHandler<ElementIdsAppliedCommand> {
    return (message, editorId) => {
        elementIdsSvc.reportApplied(editorId, message);
    };
}

/** `OpenElementIdReviewCommand` → "Review all IDs…" opens the host's review of this diagram. */
export function openElementIdReviewHandler(
    elementIdsSvc: ElementIdsService,
): MessageHandler<OpenElementIdReviewCommand> {
    return (_message, editorId) => elementIdsSvc.generate(editorId);
}

/** `GetBpmnFileCommand` → a restarted page lists the open review's rows again. */
export function resumeElementIdReviewHandler(
    elementIdsSvc: ElementIdsService,
): MessageHandler<GetBpmnFileCommand> {
    return (_message, editorId) => elementIdsSvc.resume(editorId);
}

/** `ElementIdReviewCommand` → tell the user when the review could not open. */
export function elementIdReviewHandler(
    elementIdsSvc: ElementIdsService,
): MessageHandler<ElementIdReviewCommand> {
    return (message) => {
        elementIdsSvc.reportReview(message);
    };
}
