import { ExtensionContext, workspace } from "vscode";

import { BpmnScriptFileSystem } from "../scriptTask/infrastructure/BpmnScriptFileSystem";
import { ScriptCompletionProvider } from "../scriptTask/controller/ScriptCompletionProvider";
import { ScriptTaskService } from "../scriptTask/controller/ScriptTaskService";
import { SharedDeps } from "./sharedDeps";

/**
 * The inline-script-editor feature owns the virtual `bpmn-script:` filesystem,
 * the task service, and the completion provider. Registering the FS provider
 * here (rather than in `activate`) is safe because no `bpmn-script:` URI is
 * resolved during activation. `scriptTaskSvc` is returned because the editor
 * feature wires it into the BPMN router and a teardown participant.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
): { scriptTaskSvc: ScriptTaskService } {
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

    new ScriptCompletionProvider().register(context);

    return { scriptTaskSvc };
}
