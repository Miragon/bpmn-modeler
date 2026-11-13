import { LoggerPort, NotifierPort, PickerPort } from "../../kernel/port/hostPorts";
import { EditorContribution } from "../../editorSession/service/EditorContribution";
import { EditorSessionStore } from "../../editorSession/service/EditorSessionStore";
import { ScriptEditorPort } from "../port/ScriptEditorPort";
import { ScriptVariableStore } from "../domain/ScriptVariableStore";
import {
    openScriptEditorHandler,
    openScriptEditorsHandler,
    resyncScriptEditorsHandler,
    updateScriptSourceHandler,
    updateScriptVariablesHandler,
} from "../adapter/in/scriptMessageHandlers";
import { ScriptFileStore } from "../service/ScriptFileStore";
import { ScriptEditorParticipant } from "../service/ScriptEditorParticipant";
import { ScriptTabService } from "../service/ScriptTabService";
import { ScriptTargetResolver } from "../service/ScriptTargetResolver";

export interface ScriptEditorHostPorts {
    readonly store: EditorSessionStore;
    readonly scriptEditor: ScriptEditorPort;
    /** Asks for a language the model lacks. */
    readonly picker: PickerPort;
    /** Shared with the host's script completion, which reads what the webview extracted. */
    readonly variables: ScriptVariableStore;
    /** The store the host's script editor writes through; it names the folder of a batch. */
    readonly scriptFiles: ScriptFileStore;
    readonly notifier: NotifierPort & LoggerPort;
}

/**
 * Inline-script editing for every host: the BPMN editor's script commands
 * reach the core's {@link ScriptTabService}, which keeps the host's script
 * tabs in step, and a closed editor takes its tabs, files and variables with
 * it.
 */
export class ScriptEditorFeature {
    readonly scriptTabs: ScriptTabService;
    readonly editorContribution: EditorContribution<
        | "OpenScriptEditorCommand"
        | "OpenScriptEditorsCommand"
        | "UpdateScriptSourceCommand"
        | "UpdateScriptVariablesCommand"
        | "GetBpmnModelerSettingCommand"
    >;

    constructor({
        store,
        scriptEditor,
        picker,
        variables,
        scriptFiles,
        notifier,
    }: ScriptEditorHostPorts) {
        const scriptTabs = new ScriptTabService(
            store,
            scriptEditor,
            new ScriptTargetResolver(store, picker, notifier),
            scriptFiles,
            notifier,
        );
        this.scriptTabs = scriptTabs;
        this.editorContribution = {
            commandHandlers: {
                OpenScriptEditorCommand: openScriptEditorHandler(scriptTabs, variables, notifier),
                OpenScriptEditorsCommand: openScriptEditorsHandler(
                    scriptTabs,
                    variables,
                    scriptFiles,
                    notifier,
                ),
                UpdateScriptSourceCommand: updateScriptSourceHandler(scriptTabs),
                UpdateScriptVariablesCommand: updateScriptVariablesHandler(scriptTabs, variables),
                GetBpmnModelerSettingCommand: resyncScriptEditorsHandler(scriptTabs),
            },
            participant: new ScriptEditorParticipant(scriptTabs, variables),
        };
    }
}
