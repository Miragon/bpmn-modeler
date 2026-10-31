import { tmpdir } from "os";
import { sep } from "path";

import { OpenAllScriptTasksQuery } from "@miragon/bpmn-modeler-shared";
import {
    BpmnEditorContributions,
    FOCUS_BPMN_DIAGRAM_MESSAGE,
    ScriptEditorFeature,
    ScriptFileStore,
    ScriptVariableStore,
} from "@miragon/bpmn-modeler-core";

import { BridgeScriptEditor } from "../scriptAdapters";
import { METHODS } from "../protocol/descriptor";
import {
    ScriptCloseParams,
    ScriptDidChangeParams,
    ScriptDidOpenExternalParams,
} from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The inline-script-editor feature owns the {@link BridgeScriptEditor}, the
 * host's script tabs behind the core's `ScriptEditorPort`. The core
 * `ScriptEditorFeature` turns it into the BPMN editor's script commands and the
 * participant that closes an editor's tabs on dispose.
 *
 * RPC (Host → Core): script/didChange, script/didClose, script/openAll,
 * script/didOpenExternal.
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

    // The host edited an open script tab → push the new content into the owning
    // BPMN webview, which writes it to the moddle property via bpmn-js.
    deps.rpc.on(METHODS.scriptDidChange, (params: ScriptDidChangeParams) => {
        scriptEditor.didChange(params.scriptId, params.content);
    });

    // A script tab closed on the host (user close, or the ack of our own
    // script/close) → drop tracking so a re-open re-reads the current BPMN
    // content, and delete the on-disk file now that the host's flush-save
    // is guaranteed to have finished. Returned (not `void`ed) so the dispatcher
    // awaits the debounce flush before the frame is considered handled.
    deps.rpc.on(METHODS.scriptDidClose, (params: ScriptCloseParams) =>
        scriptEditor.didClose(params.scriptId),
    );

    // The host reported a script file opened outside our own `script/open` flow
    // (Project view, or the panel button on an untracked file) → adopt it so
    // keystrokes stream into the owning BPMN webview from now on.
    deps.rpc.on(METHODS.scriptDidOpenExternal, (params: ScriptDidOpenExternalParams) =>
        scriptEditor.adoptExternalOpen(params.filePath),
    );

    // Tools ▸ Generate Script Files for Script Tasks → ask the active BPMN webview
    // for its inline script tasks. No active editor means no BPMN tab is focused;
    // guide the user rather than surfacing the raw throw.
    deps.rpc.on(METHODS.scriptOpenAll, async () => {
        try {
            const editorId = deps.store.getActiveEditorId();
            await deps.store.postMessage(editorId, new OpenAllScriptTasksQuery());
        } catch (error) {
            deps.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            deps.notifier.showInfo(FOCUS_BPMN_DIAGRAM_MESSAGE);
        }
    });

    const { editorContribution } = new ScriptEditorFeature({
        scriptEditor,
        variables,
        scriptFiles,
        notifier: deps.notifier,
    });
    return { editorContribution };
}
