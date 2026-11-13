import { tmpdir } from "os";
import { sep } from "path";

import {
    BpmnEditorContributions,
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";

import { BridgeScriptEditor } from "../scriptTask/adapter/out/BridgeScriptEditor";
import { scriptHandlers } from "../scriptTask/adapter/in/scriptHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The inline-script-editor feature owns the {@link BridgeScriptEditor}, the
 * host's script tabs behind the core's `ScriptEditorPort`. The core
 * `ScriptEditorFeature` keeps them in step with the BPMN editor's script
 * commands and closes an editor's tabs on dispose.
 */
export function register(deps: BridgeSharedDeps): {
    editorContribution: BpmnEditorContributions["scriptEditor"];
} {
    const scriptFiles = new ScriptFileStore(
        deps.store,
        deps.nodeWorkspace,
        deps.settings,
        deps.artifactSvc,
        deps.notifier,
        tmpdir(),
        (path) => path.replaceAll("/", sep),
    );
    const variables = new ScriptVariableStore();
    const scriptEditor = new BridgeScriptEditor(
        deps.rpc,
        deps.notifier,
        deps.settings,
        scriptFiles,
        variables,
    );

    bindHandlers(
        deps.rpc,
        scriptHandlers({ scriptTabs: scriptEditor, store: deps.store, notifier: deps.notifier }),
    );

    const { editorContribution } = new ScriptEditorFeature({
        store: deps.store,
        scriptEditor,
        picker: deps.picker,
        variables,
        scriptFiles,
        notifier: deps.notifier,
        // An RPC webview still takes messages while its editor closes.
        options: { flushEditsOnEditorClose: true },
    });
    return { editorContribution };
}
