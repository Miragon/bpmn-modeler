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
 * `ScriptEditorFeature` turns it into the BPMN editor's script commands and the
 * participant that closes an editor's tabs on dispose.
 */
export function register(deps: BridgeSharedDeps): {
    editorContribution: BpmnEditorContributions["scriptEditor"];
} {
    // The script tabs have no in-core service — the VS Code original was never
    // extracted (its guts are VS Code-specific accidental complexity) — so the
    // portable slice lives here, writing through the core's file store, and the
    // Kotlin host is a dumb editor surface keyed by an opaque scriptId.
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
        deps.picker,
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
