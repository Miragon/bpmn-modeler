import { NotifierPort } from "../kernel/domain/hostPorts";
import { EditorContribution } from "../editorSession/service/EditorContribution";
import { ScriptEditorPort } from "./domain/ports";
import { ScriptVariableStore } from "./domain/ScriptVariableStore";
import {
    openScriptEditorHandler,
    openScriptEditorsHandler,
    resyncScriptEditorsHandler,
    updateScriptSourceHandler,
    updateScriptVariablesHandler,
} from "./infrastructure/scriptMessageHandlers";
import { ScriptFileStore } from "./service/ScriptFileStore";
import { ScriptEditorParticipant } from "./session/ScriptEditorParticipant";

export interface ScriptEditorHostPorts {
    readonly scriptEditor: ScriptEditorPort;
    /** Shared with the host's script completion, which reads what the webview extracted. */
    readonly variables: ScriptVariableStore;
    /** The store the host's script editor writes through; it names the folder of a batch. */
    readonly scriptFiles: ScriptFileStore;
    readonly notifier: NotifierPort;
}

/**
 * Inline-script editing for every host: the BPMN editor's script commands
 * reach the host's script tabs, and a closed editor takes its tabs, files and
 * variables with it.
 */
export class ScriptEditorFeature {
    readonly editorContribution: EditorContribution<
        | "OpenScriptEditorCommand"
        | "OpenScriptEditorsCommand"
        | "UpdateScriptSourceCommand"
        | "UpdateScriptVariablesCommand"
        | "GetBpmnModelerSettingCommand"
    >;

    constructor({ scriptEditor, variables, scriptFiles, notifier }: ScriptEditorHostPorts) {
        this.editorContribution = {
            commandHandlers: {
                OpenScriptEditorCommand: openScriptEditorHandler(scriptEditor, variables, notifier),
                OpenScriptEditorsCommand: openScriptEditorsHandler(
                    scriptEditor,
                    variables,
                    scriptFiles,
                    notifier,
                ),
                UpdateScriptSourceCommand: updateScriptSourceHandler(scriptEditor),
                UpdateScriptVariablesCommand: updateScriptVariablesHandler(scriptEditor, variables),
                GetBpmnModelerSettingCommand: resyncScriptEditorsHandler(scriptEditor),
            },
            participant: new ScriptEditorParticipant(scriptEditor, variables),
        };
    }
}
