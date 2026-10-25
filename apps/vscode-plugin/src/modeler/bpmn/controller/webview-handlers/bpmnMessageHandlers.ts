import {
    Command,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    SetLintingEnabledCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";

import { ConfigurationTarget, workspace } from "vscode";

import { posix } from "path";

import {
    materializeScriptBatch,
    MessageHandler,
    NO_INLINE_SCRIPTS_MESSAGE,
    NotifierPort,
    scriptBatchSummary,
    ScriptVariableStore,
    SettingsPort,
    TMP_SCRIPTING_SEGMENT,
} from "@miragon/bpmn-modeler-core";
import { ScriptTaskService } from "../../../../scriptTask/index";

/**
 * The BPMN webview handlers only VS Code has: the inline script-task editor and
 * the linting switch, which writes the user's VS Code settings. The host-agnostic
 * handlers live in `@miragon/bpmn-modeler-core`.
 */

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

/**
 * `SetLintingEnabledCommand` → persist the user's linting on/off choice.
 *
 * Written at Global (User) scope so a design-only user silences linting across
 * every project in one switch — matching the intent of a personal preference,
 * like {@link CommandController.changeLanguage}. The config write re-triggers a
 * lint (via {@link BpmnlintParticipant}'s change listener), which pushes the new
 * state back to the webview; the webview never flips its own overlays.
 */
export function setLintingEnabledHandler(): MessageHandler<SetLintingEnabledCommand> {
    return async (message) => {
        await workspace
            .getConfiguration("miragon.bpmnModeler")
            .update("linting.enabled", message.enabled, ConfigurationTarget.Global);
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
): MessageHandler<OpenScriptEditorCommand> {
    return async (cmd, editorId) => {
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
    notifier: NotifierPort,
): MessageHandler<OpenScriptEditorsCommand> {
    return async (cmd, editorId) => {
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
export function updateScriptVariablesHandler(
    variableStore: ScriptVariableStore,
): MessageHandler<UpdateScriptVariablesCommand> {
    return (message, editorId) => {
        variableStore.setExtracted(editorId, message.variables);
    };
}

/**
 * `UpdateScriptSourceCommand` → apply a model-side script change (canvas
 * undo/redo, external reload, element deletion) to the open script tab.
 */
export function updateScriptSourceHandler(
    scriptTaskSvc: ScriptTaskService,
): MessageHandler<UpdateScriptSourceCommand> {
    return async (cmd, editorId) => {
        await scriptTaskSvc.applyModelChange(
            editorId,
            cmd.elementId,
            cmd.kind,
            cmd.listenerIndex,
            cmd.content,
        );
    };
}
