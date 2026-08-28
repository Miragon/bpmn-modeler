import {
    Command,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    NavigateToImplementationCommand,
    NavigateToReferencedModelCommand,
    SetClipboardCommand,
    SetLintingEnabledCommand,
    SetPropertiesPanelStateCommand,
    SetTextClipboardCommand,
    SyncActivitiesCommand,
    SyncDocumentCommand,
    UpdateLintResultsCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";

import { ConfigurationTarget, workspace } from "vscode";

import { posix } from "path";

import {
    EditorSessionStore,
    materializeScriptBatch,
    NO_INLINE_SCRIPTS_MESSAGE,
    scriptBatchSummary,
    ScriptVariableStore,
    SettingsPort,
    TMP_SCRIPTING_SEGMENT,
} from "@miragon/bpmn-modeler-core";
import { VsCodeNotifier } from "../../../../shared/infrastructure/VsCodeNotifier";
import { MessageHandler } from "@miragon/bpmn-modeler-core";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";
import { BpmnClipboardMediator } from "@miragon/bpmn-modeler-core";
import { BpmnElementTemplatesService } from "@miragon/bpmn-modeler-core";
import { BpmnLintConfigService } from "@miragon/bpmn-modeler-core";
import { BpmnPropertiesPanelService } from "@miragon/bpmn-modeler-core";
import { BpmnSettingsBroadcaster } from "@miragon/bpmn-modeler-core";
import { ModelNavigationService } from "../../../../navigation/index";
import { CodeLinkMapService, ImplementationNavigationService } from "../../../../codeLink/index";
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
            notifier.logDebug("Bpmn modeler is ready");
        }
    };
}

/** `GetElementTemplatesCommand` → push the configured element templates. */
export function getElementTemplatesHandler(
    templatesSvc: BpmnElementTemplatesService,
): MessageHandler {
    // Await (not fire-and-forget) so a rejection propagates to the router's
    // dispatch catch (ModelerEditorController) instead of floating off unlogged.
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

/**
 * Second handler for `GetBpmnModelerSettingCommand`, run on every (re)load:
 * replay script edits made while the webview was hidden, then re-broadcast the
 * open-script set so the properties-panel lock survives the reload (the webview
 * drops its lock state whenever it is hidden and re-shown).
 */
export function resyncScriptTasksHandler(scriptTaskSvc: ScriptTaskService): MessageHandler {
    return async (_message: Command, editorId: string) => {
        await scriptTaskSvc.resyncOpenDocuments(editorId);
        scriptTaskSvc.syncLockState(editorId);
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
 * findings the webview computed in its in-page default run (#1373 Phase B). The
 * service ignores the push when the editor is no longer on the in-page path (a
 * workspace-config takeover) or when linting is disabled.
 */
export function updateLintResultsHandler(lintSvc: BpmnLintConfigService): MessageHandler {
    return (message: Command, editorId: string) => {
        const cmd = message as UpdateLintResultsCommand;
        lintSvc.applyWebviewLintResults(editorId, cmd.results, cmd.unresolved);
    };
}

/**
 * `SetLintingEnabledCommand` → persist the user's linting on/off choice.
 *
 * Written at Global (User) scope so a design-only user silences linting across
 * every project in one switch — matching the intent of a personal preference,
 * like {@link CommandController.changeLanguage}. The config write re-triggers a
 * lint (via {@link BpmnlintParticipant}'s change listener), which pushes the new
 * state back to the webview; the webview never flips its own overlays.
 */
export function setLintingEnabledHandler(): MessageHandler {
    return async (message: Command) => {
        await workspace
            .getConfiguration("miragon.bpmnModeler")
            .update(
                "linting.enabled",
                (message as SetLintingEnabledCommand).enabled,
                ConfigurationTarget.Global,
            );
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

/**
 * `OpenScriptEditorCommand` → open the inline script in an editor tab.
 *
 * Seeds the variable store from the command's `variables` first so completion
 * is accurate before the very first keystroke, even if no live
 * `UpdateScriptVariablesCommand` has arrived yet.
 */
export function openScriptEditorHandler(
    scriptTaskSvc: ScriptTaskService,
    variableStore: ScriptVariableStore,
): MessageHandler {
    return async (message: Command, editorId: string) => {
        const cmd = message as OpenScriptEditorCommand;
        variableStore.setExtracted(editorId, cmd.variables ?? []);
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
 * `OpenScriptEditorsCommand` → generate a file on disk for every inline script
 * task in the diagram, opening no tabs. Live sync into the model begins only
 * once the user opens one of the generated files (adoption).
 *
 * The variable store is seeded once before the first write (the model is
 * identical for all scripts in one diagram); the batch policy — sequential
 * materialisation and the summary toast — lives in
 * {@link materializeScriptBatch}, shared with the bridge. An empty batch — a
 * C8 diagram or one with no inline scripts — surfaces a friendly info message.
 */
export function openScriptEditorsHandler(
    scriptTaskSvc: ScriptTaskService,
    variableStore: ScriptVariableStore,
    settings: SettingsPort,
    notifier: VsCodeNotifier,
): MessageHandler {
    return async (message: Command, editorId: string) => {
        const cmd = message as OpenScriptEditorsCommand;
        if (cmd.scripts.length === 0) {
            notifier.showInfo(NO_INLINE_SCRIPTS_MESSAGE);
            return;
        }
        variableStore.setExtracted(editorId, cmd.variables ?? []);

        const outcome = await materializeScriptBatch(cmd.scripts, (script) =>
            scriptTaskSvc.materializeScript(
                editorId,
                script.elementId,
                "script-task",
                undefined,
                undefined,
                script.scriptFormat,
                script.content,
            ),
        );

        const folder = posix.join(settings.getConfigFolder(), TMP_SCRIPTING_SEGMENT);
        notifier.showInfo(scriptBatchSummary(outcome, folder));
    };
}

/** `UpdateScriptVariablesCommand` → replace the editor's variable model for live completion. */
export function updateScriptVariablesHandler(variableStore: ScriptVariableStore): MessageHandler {
    return (message: Command, editorId: string) => {
        variableStore.setExtracted(editorId, (message as UpdateScriptVariablesCommand).variables);
    };
}

/**
 * `UpdateScriptSourceCommand` → apply a model-side script change (canvas
 * undo/redo, external reload, element deletion) to the open script tab.
 */
export function updateScriptSourceHandler(scriptTaskSvc: ScriptTaskService): MessageHandler {
    return async (message: Command, editorId: string) => {
        const cmd = message as UpdateScriptSourceCommand;
        await scriptTaskSvc.applyModelChange(
            editorId,
            cmd.elementId,
            cmd.kind,
            cmd.listenerIndex,
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

// The implementation kinds the host knows how to resolve. Used as a runtime
// guard so a malformed/hostile message can't reach the locator with a bogus kind.
const KNOWN_IMPLEMENTATION_KINDS = new Set([
    "javaClass",
    "delegateExpression",
    "expression",
    "externalTopic",
    "jobType",
]);

/**
 * `NavigateToImplementationCommand` → jump to the task's source implementation.
 *
 * Defence-in-depth: an unknown/empty `kind` is rejected with a warning rather
 * than falling through, so a malformed message can't be resolved as an
 * arbitrary kind by default.
 */
export function navigateToImplementationHandler(
    editorStore: EditorSessionStore,
    implementationNavigationService: ImplementationNavigationService,
    notifier: VsCodeNotifier,
): MessageHandler {
    return async (message: Command, editorId: string) => {
        const cmd = message as NavigateToImplementationCommand;
        if (!KNOWN_IMPLEMENTATION_KINDS.has(cmd.kind)) {
            notifier.logWarning(
                `Ignoring NavigateToImplementationCommand with unknown kind: ${String(cmd.kind)}`,
            );
            return;
        }
        const sourceFsPath = editorStore.requireHandle(editorId).documentFsPath();
        await implementationNavigationService.navigate(cmd.reference, cmd.kind, sourceFsPath);
    };
}

/**
 * `SyncActivitiesCommand` → reconcile the editor's activity→code map.
 *
 * The map service diffs the pushed references against what it holds, does
 * filesystem work only for the delta, and pushes resolution status back to the
 * webview for context-pad visibility. Invalid entries are filtered inside the
 * service, so the handler stays a thin pass-through.
 */
export function syncActivitiesHandler(mapService: CodeLinkMapService): MessageHandler {
    return async (message: Command, editorId: string) => {
        await mapService.syncActivities(editorId, (message as SyncActivitiesCommand).entries);
    };
}
