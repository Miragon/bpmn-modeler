import { tmpdir } from "os";

import { ExtensionContext, Uri } from "vscode";

import {
    BpmnEditorContributions,
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptVariableStore,
    ScriptXmlService,
} from "@miragon/bpmn-modeler-core";
import { canonicalPath } from "../shared/infrastructure/uriPath";
import { ScriptCompletionProvider } from "../scriptTask/controller/ScriptCompletionProvider";
import { ScriptTaskService } from "../scriptTask/infrastructure/ScriptTaskService";
import { ScriptTaskCommandController } from "../scriptTask/controller/ScriptTaskCommandController";
import { SharedDeps } from "./sharedDeps";

/**
 * The inline-script-editor feature owns the on-disk script store, the script
 * tabs ({@link ScriptTaskService}), the completion provider and the
 * process-variable store. The core `ScriptEditorFeature` turns the tabs into
 * the BPMN editor's script commands and their teardown, which the BPMN editor
 * feature routes.
 */
export function register(
    context: ExtensionContext,
    deps: SharedDeps,
): { editorContribution: BpmnEditorContributions["scriptEditor"] } {
    // The temp folder in `uri.path` spelling, like every path VsCodeWorkspace
    // answers, so an opened OS-temp script matches its base directory; messages
    // name it as `fsPath` (`c:\…` rather than `/c:/…` on Windows).
    const scriptFiles = new ScriptFileStore(
        deps.editorStore,
        deps.vsWorkspace,
        deps.vsSettings,
        deps.artifactSvc,
        deps.notifier,
        canonicalPath(Uri.file(tmpdir())),
        (path) => Uri.file(path).fsPath,
    );

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
    // the reply is handled by the BPMN editor's router.
    new ScriptTaskCommandController(deps.editorStore, deps.notifier).register(context);

    const scriptVariableStore = new ScriptVariableStore();
    new ScriptCompletionProvider(scriptVariableStore, deps.vsSettings, scriptTaskSvc).register(
        context,
    );

    const { editorContribution } = new ScriptEditorFeature({
        scriptEditor: scriptTaskSvc,
        variables: scriptVariableStore,
        scriptFiles,
        notifier: deps.notifier,
    });
    return { editorContribution };
}
