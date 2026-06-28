import { ExtensionContext, workspace } from "vscode";

import { ScriptVariableStore } from "@miragon/bpmn-modeler-core";
import { BpmnScriptFileSystem } from "../scriptTask/infrastructure/BpmnScriptFileSystem";
import { ScriptCompletionProvider } from "../scriptTask/controller/ScriptCompletionProvider";
import { ScriptTaskService } from "../scriptTask/controller/ScriptTaskService";
import { SharedDeps } from "./sharedDeps";

/**
 * The inline-script-editor feature owns the virtual `bpmn-script:` filesystem,
 * the task service, the completion provider, and the process-variable store.
 * Registering the FS provider here (rather than in `activate`) is safe because
 * no `bpmn-script:` URI is resolved during activation. `scriptTaskSvc` and
 * `scriptVariableStore` are returned because the editor feature wires them into
 * the BPMN router and the teardown participant.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
): { scriptTaskSvc: ScriptTaskService; scriptVariableStore: ScriptVariableStore } {
    const bpmnScriptFs = new BpmnScriptFileSystem();
    context.subscriptions.push(
        workspace.registerFileSystemProvider("bpmn-script", bpmnScriptFs, {
            isCaseSensitive: true,
        }),
    );

    const scriptTaskSvc = new ScriptTaskService(
        deps.editorStore,
        bpmnScriptFs,
        deps.notifier,
        deps.picker,
    );
    scriptTaskSvc.register(context);

    const scriptVariableStore = new ScriptVariableStore();
    new ScriptCompletionProvider(scriptVariableStore, deps.vsSettings).register(context);

    return { scriptTaskSvc, scriptVariableStore };
}
