import {
    Command,
    OpenScriptEditorCommand,
    UpdateScriptSourceCommand,
    UpdateScriptVariablesCommand,
} from "@miragon/bpmn-modeler-shared";
import { ScriptVariableManifestService } from "@miragon/bpmn-modeler-core";

import { BridgeScriptEditor } from "../scriptAdapters";
import { METHODS } from "../protocol/descriptor";
import {
    ScriptAppendToManifestParams,
    ScriptCloseParams,
    ScriptDidChangeParams,
} from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";
import { RegisterParams, SessionHooks } from "./sessionHooks";

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
    const manifestSvc = new ScriptVariableManifestService(
        deps.nodeWorkspace,
        deps.settings,
        deps.artifactSvc,
    );
    const scriptEditor = new BridgeScriptEditor(
        deps.store,
        deps.picker,
        deps.rpc,
        deps.notifier,
        deps.settings,
        manifestSvc,
        deps.nodeWorkspace,
        deps.artifactSvc,
    );

    // Manifest watchers are armed per session and disposed when that editor
    // closes, mirroring the template-watcher lifecycle in templatesSettingsFeature.
    const manifestWatchers = new Map<string, { dispose(): void }>();

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
        })
        // Reload handshake: the webview re-requests settings on (re)init, which is
        // also when it has dropped its properties-panel lock state — re-broadcast
        // the open-script set so locked fields stay locked across a reload.
        .on("GetBpmnModelerSettingCommand", (_message: Command, editorId: string) => {
            scriptEditor.syncLockState(editorId);
        })
        // A script changed on the *model* side (canvas undo/redo, document
        // reload, element deletion) → overwrite or close the owning tab.
        .on("UpdateScriptSourceCommand", (message: Command, editorId: string) => {
            scriptEditor.applyModelChange(message as UpdateScriptSourceCommand, editorId);
        });

    // The host edited an open script tab → push the new content into the owning
    // BPMN webview, which writes it to the moddle property via bpmn-js.
    deps.rpc.on(METHODS.scriptDidChange, (params: ScriptDidChangeParams) => {
        void scriptEditor.didChange(params.scriptId, params.content);
    });

    // A script tab closed on the host (user close, or the ack of our own
    // script/close) → drop tracking so a re-open re-reads the current BPMN
    // content, and delete the on-disk file now that the host's flush-save
    // is guaranteed to have finished.
    deps.rpc.on(METHODS.scriptDidClose, (params: ScriptCloseParams) => {
        scriptEditor.didClose(params.scriptId);
    });

    // The host's "Declare in variable manifest" intention → scaffold the entry in
    // the diagram's manifest and reveal it. Fire-and-forget; the manifest watcher
    // re-pushes completion on the resulting write.
    deps.rpc.on(METHODS.scriptAppendToManifest, (params: ScriptAppendToManifestParams) => {
        void scriptEditor.appendToManifest(params.scriptId, {
            name: params.name,
            type: params.type,
            description: params.description,
        });
    });

    return {
        sessionHooks: {
            // Load the manifest and arm its watcher so authored variables merge
            // into completion and refresh live. Guard non-file editors (a diff
            // pane has no manifest on disk); the manifest service speaks fs paths,
            // so pass the host-provided `fsPath`.
            onSessionRegistered: async (params: RegisterParams) => {
                if (params.scheme !== "file") {
                    return;
                }
                await scriptEditor.loadManifest(params.editorId, params.fsPath);
                manifestWatchers.set(
                    params.editorId,
                    await scriptEditor.watchManifest(params.editorId, params.fsPath),
                );
            },
            // Close any script tabs this editor opened before its handle is
            // dropped, and stop watching its manifest.
            onSessionDisposed: (editorId) => {
                manifestWatchers.get(editorId)?.dispose();
                manifestWatchers.delete(editorId);
                scriptEditor.disposeEditor(editorId);
            },
        },
    };
}
