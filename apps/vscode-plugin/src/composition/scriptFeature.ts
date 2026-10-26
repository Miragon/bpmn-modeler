import { ExtensionContext } from "vscode";

import { ScriptVariableStore, ScriptXmlService } from "@miragon/bpmn-modeler-core";
import { ScriptFileStore } from "../scriptTask/infrastructure/ScriptFileStore";
import { ScriptCompletionProvider } from "../scriptTask/controller/ScriptCompletionProvider";
import { ScriptTaskService } from "../scriptTask/controller/ScriptTaskService";
import { ScriptTaskCommandController } from "../scriptTask/controller/ScriptTaskCommandController";
import { SharedDeps } from "./sharedDeps";

/**
 * The inline-script-editor feature owns the on-disk script store under
 * `<configFolder>/tmp/scripting/`, the task service, the completion provider,
 * and the process-variable store. `scriptTaskSvc` and `scriptVariableStore` are
 * returned because the editor feature wires them into the BPMN router and the
 * teardown participant.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
): {
    scriptTaskSvc: ScriptTaskService;
    scriptVariableStore: ScriptVariableStore;
} {
    const scriptFiles = new ScriptFileStore(
        deps.editorStore,
        deps.vsWorkspace,
        deps.vsSettings,
        deps.artifactSvc,
    );

    // Orphan cleanup is a one-shot sweep per base directory on first open (see
    // ScriptFileStore.prepareBaseDir) rather than an activation-time scan — the
    // latter missed git-root / document-dir bases outside the workspace folders.

    const scriptTaskSvc = new ScriptTaskService(
        deps.editorStore,
        scriptFiles,
        deps.vsSettings,
        deps.notifier,
        deps.picker,
        new ScriptXmlService(),
    );
    scriptTaskSvc.register(context);

    // The "Generate Script Files for Script Tasks" palette command only posts the query;
    // the reply is handled by the router handler wired in the editor feature.
    new ScriptTaskCommandController(deps.editorStore, deps.notifier).register(context);

    const scriptVariableStore = new ScriptVariableStore();
    new ScriptCompletionProvider(scriptVariableStore, deps.vsSettings, scriptTaskSvc).register(
        context,
    );

    return { scriptTaskSvc, scriptVariableStore };
}
