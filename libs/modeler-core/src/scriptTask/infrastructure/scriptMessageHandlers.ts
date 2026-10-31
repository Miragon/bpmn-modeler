import {
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";

import { notifiedErrorLogText } from "../../kernel/domain/errorLogText";
import { NotifierPort } from "../../kernel/domain/hostPorts";
import { MessageHandler } from "../../editorSession/service/WebviewMessageRouter";
import { ScriptEditorPort } from "../domain/ports";
import { NO_INLINE_SCRIPTS_MESSAGE, scriptBatchSummary } from "../domain/scriptBatchSummary";
import { ScriptVariableStore } from "../domain/ScriptVariableStore";
import { materializeScriptBatch } from "../service/scriptBatch";
import { ScriptFileStore } from "../service/ScriptFileStore";

/**
 * Second handler for `GetBpmnModelerSettingCommand`, which the webview sends on
 * every (re)load: it drops its field locks then, and may have missed edits made
 * while it was hidden.
 */
export function resyncScriptEditorsHandler(scriptEditor: ScriptEditorPort): MessageHandler {
    return async (_message, editorId) => {
        await scriptEditor.resync(editorId);
    };
}

/**
 * `OpenScriptEditorCommand` → open the inline script in a host tab. The
 * command's variables are stored first, so completion is right before the
 * first live `UpdateScriptVariablesCommand` arrives.
 */
export function openScriptEditorHandler(
    scriptEditor: ScriptEditorPort,
    variables: ScriptVariableStore,
    notifier: NotifierPort,
): MessageHandler<OpenScriptEditorCommand> {
    return async (command, editorId) => {
        variables.setExtracted(editorId, command.variables ?? []);
        try {
            await scriptEditor.open(editorId, command);
        } catch (error) {
            notifier.logError(
                notifiedErrorLogText(
                    `Could not open the script of ${command.elementId}`,
                    error as Error,
                ),
            );
        }
    };
}

/**
 * `OpenScriptEditorsCommand` → write a file for every inline script task of
 * the diagram and open no tab; live sync starts once the user opens one. The
 * batch is {@link materializeScriptBatch}, and the toast
 * {@link scriptBatchSummary} names the folder the files went to.
 */
export function openScriptEditorsHandler(
    scriptEditor: ScriptEditorPort,
    variables: ScriptVariableStore,
    scriptFiles: ScriptFileStore,
    notifier: NotifierPort,
): MessageHandler<OpenScriptEditorsCommand> {
    return async (command, editorId) => {
        if (command.scripts.length === 0) {
            notifier.showInfo(NO_INLINE_SCRIPTS_MESSAGE);
            return;
        }
        variables.setExtracted(editorId, command.variables ?? []);

        const outcome = await materializeScriptBatch(
            command.scripts,
            (script) =>
                scriptEditor.materialize(editorId, {
                    elementId: script.elementId,
                    kind: "script-task",
                    listenerIndex: undefined,
                    eventName: undefined,
                    scriptFormat: script.scriptFormat,
                    content: script.content,
                }),
            notifier,
        );

        notifier.showInfo(scriptBatchSummary(outcome, scriptFiles.displayNameFor(editorId)));
    };
}

/** `UpdateScriptVariablesCommand` → replace the editor's process variables for live completion. */
export function updateScriptVariablesHandler(
    scriptEditor: ScriptEditorPort,
    variables: ScriptVariableStore,
): MessageHandler<UpdateScriptVariablesCommand> {
    return (command, editorId) => {
        variables.setExtracted(editorId, command.variables);
        scriptEditor.variablesChanged(editorId);
    };
}

/**
 * `UpdateScriptSourceCommand` → a canvas undo or redo, a reload or a deleted
 * element changed a script that a tab owns; the model side wins.
 */
export function updateScriptSourceHandler(
    scriptEditor: ScriptEditorPort,
): MessageHandler<UpdateScriptSourceCommand> {
    return async (command, editorId) => {
        await scriptEditor.applyModelChange(editorId, command);
    };
}
