import {
    Command,
    OpenScriptEditorCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";

import { BridgeScriptEditor } from "../scriptAdapters";
import { BridgeSharedDeps } from "./sharedDeps";
import { SessionHooks } from "./sessionHooks";

/**
 * The inline-script-editor feature owns the {@link BridgeScriptEditor}
 * orchestrator. It returns a session hook so the editor-session feature closes
 * this editor's open script tabs on dispose — without importing script types.
 *
 * Webview messages: OpenScriptEditorCommand, UpdateScriptVariablesCommand.
 * RPC (Host → Core): script/didChange, script/didClose.
 */
export function register(deps: BridgeSharedDeps): { sessionHooks: SessionHooks } {
    // "Edit Script" orchestrator. Unlike the other features this one has no
    // in-core service — the VS Code original was never extracted (its guts are
    // VS Code-specific accidental complexity) — so the portable slice lives here
    // and the Kotlin host is a dumb editor surface keyed by an opaque scriptId.
    const scriptEditor = new BridgeScriptEditor(deps.store, deps.picker, deps.rpc, deps.notifier);

    deps.router
        .on("OpenScriptEditorCommand", (message: Command, editorId: string) => {
            void scriptEditor.open(message as OpenScriptEditorCommand, editorId);
        })
        // Live process-variable model update → push to every open script tab of
        // this editor so completion stays current without reopening.
        .on("UpdateScriptVariablesCommand", (message: Command, editorId: string) => {
            scriptEditor.updateVariables(
                editorId,
                (message as UpdateScriptVariablesCommand).variables,
            );
        });

    // The host edited an open script tab → push the new content into the owning
    // BPMN webview, which writes it to the moddle property via bpmn-js.
    deps.rpc.on("script/didChange", (params: { scriptId: string; content: string }) => {
        void scriptEditor.didChange(params.scriptId, params.content);
    });

    // The user closed a script tab on the host → drop tracking so a re-open
    // re-reads the current BPMN content rather than revealing a stale tab.
    deps.rpc.on("script/didClose", (params: { scriptId: string }) => {
        scriptEditor.didClose(params.scriptId);
    });

    return {
        sessionHooks: {
            // Close any script tabs this editor opened before its handle is dropped.
            onSessionDisposed: (editorId) => scriptEditor.disposeEditor(editorId),
        },
    };
}
