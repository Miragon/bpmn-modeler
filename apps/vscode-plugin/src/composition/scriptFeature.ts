import { ExtensionContext, workspace } from "vscode";

import { ScriptVariableManifestService, ScriptVariableStore } from "@miragon/bpmn-modeler-core";
import { BpmnScriptFileSystem } from "../scriptTask/infrastructure/BpmnScriptFileSystem";
import { ScriptCompletionProvider } from "../scriptTask/controller/ScriptCompletionProvider";
import { ScriptDeclareVariableCodeAction } from "../scriptTask/controller/ScriptDeclareVariableCodeAction";
import { ScriptManifestParticipant } from "../modeler/bpmn/controller/editor-participants/ScriptManifestParticipant";
import { ScriptTaskService } from "../scriptTask/controller/ScriptTaskService";
import { SharedDeps } from "./sharedDeps";

/**
 * The inline-script-editor feature owns the virtual `bpmn-script:` filesystem,
 * the task service, the completion provider, and the process-variable store.
 * Registering the FS provider here (rather than in `activate`) is safe because
 * no `bpmn-script:` URI is resolved during activation. `scriptTaskSvc`,
 * `scriptVariableStore`, and `scriptManifestParticipant` are returned because
 * the editor feature wires them into the BPMN router, the teardown participant,
 * and the session participant list.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
): {
    scriptTaskSvc: ScriptTaskService;
    scriptVariableStore: ScriptVariableStore;
    scriptManifestParticipant: ScriptManifestParticipant;
} {
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

    // One manifest service feeds both the read path (the participant loads/watches
    // it into the store) and the write path (the code action scaffolds entries).
    const manifestSvc = new ScriptVariableManifestService(
        deps.vsWorkspace,
        deps.vsSettings,
        deps.artifactSvc,
    );

    new ScriptDeclareVariableCodeAction(
        scriptTaskSvc,
        scriptVariableStore,
        manifestSvc,
        deps.notifier,
    ).register(context);

    const scriptManifestParticipant = new ScriptManifestParticipant(
        manifestSvc,
        scriptVariableStore,
        deps.notifier,
    );

    return { scriptTaskSvc, scriptVariableStore, scriptManifestParticipant };
}
