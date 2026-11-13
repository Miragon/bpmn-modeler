import { tmpdir } from "os";
import { sep } from "path";

import {
    BpmnEditorContributions,
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptTargetResolver,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";

import { BridgeScriptEditor } from "../scriptTask/adapter/out/BridgeScriptEditor";
import { scriptHandlers } from "../scriptTask/adapter/in/scriptHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The inline-script-editor feature owns the {@link BridgeScriptEditor}, the
 * host's script tabs behind the core's `ScriptEditorPort`. The core
 * `ScriptEditorFeature` turns it into the BPMN editor's script commands and the
 * participant that closes an editor's tabs on dispose.
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
        deps.store,
        new ScriptTargetResolver(deps.store, deps.picker, deps.notifier),
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
        scriptEditor,
        variables,
        scriptFiles,
        notifier: deps.notifier,
    });
    return { editorContribution };
}
