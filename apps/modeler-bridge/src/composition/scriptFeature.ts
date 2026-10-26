import { posix } from "path";

import {
    OpenAllScriptTasksQuery,
    OpenScriptEditorCommand,
    OpenScriptEditorsCommand,
} from "@miragon/bpmn-modeler-shared";
import {
    EditorSessionContext,
    EditorSessionParticipant,
    materializeScriptBatch,
    NO_INLINE_SCRIPTS_MESSAGE,
    scriptBatchSummary,
    TMP_SCRIPTING_SEGMENT,
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
 * The inline-script-editor feature owns the {@link BridgeScriptEditor}
 * orchestrator. Its session participant closes the editor's open script tabs on
 * dispose.
 *
 * Webview messages: OpenScriptEditorCommand, UpdateScriptVariablesCommand,
 * OpenScriptEditorsCommand (bulk "generate script files" reply).
 * RPC (Host → Core): script/didChange, script/didClose, script/openAll,
 * script/didOpenExternal.
 */
export function register(deps: BridgeSharedDeps): { participants: EditorSessionParticipant[] } {
    // "Edit Script" orchestrator. Unlike the other features this one has no
    // in-core service — the VS Code original was never extracted (its guts are
    // VS Code-specific accidental complexity) — so the portable slice lives here
    // and the Kotlin host is a dumb editor surface keyed by an opaque scriptId.
    const scriptEditor = new BridgeScriptEditor(
        deps.store,
        deps.picker,
        deps.rpc,
        deps.notifier,
        deps.settings,
        deps.nodeWorkspace,
        deps.artifactSvc,
    );

    deps.router
        .on("OpenScriptEditorCommand", (message, editorId) => {
            void scriptEditor.open(message, editorId);
        })
        // Live process-variable model update → push to every open script tab of
        // this editor so completion stays current without reopening.
        .on("UpdateScriptVariablesCommand", (message, editorId) => {
            scriptEditor.updateVariables(editorId, message.variables);
        })
        // Reload handshake: the webview re-requests settings on (re)init, which is
        // also when it has dropped its properties-panel lock state — re-broadcast
        // the open-script set so locked fields stay locked across a reload.
        .on("GetBpmnModelerSettingCommand", (_message, editorId) => {
            scriptEditor.syncLockState(editorId);
        })
        // A script changed on the *model* side (canvas undo/redo, document
        // reload, element deletion) → overwrite or close the owning tab.
        .on("UpdateScriptSourceCommand", (message, editorId) => {
            scriptEditor.applyModelChange(message, editorId);
        })
        // Bulk reply to OpenAllScriptTasksQuery: open every inline script task the
        // webview found, one at a time — a concurrent open would race the
        // per-script format quick-picks (see OpenScriptEditorsCommand).
        .on("OpenScriptEditorsCommand", (message, editorId) => {
            return openAllScripts(message, editorId);
        });

    /**
     * Materialises each script task to disk, opening no tabs. The batch policy
     * (sequential picker round-trips, outcome counting, summary toast) lives in
     * {@link materializeScriptBatch}, shared with the VS Code handler. The
     * `variables` model is re-seeded per script — idempotent, since every
     * script in a diagram carries the same process-variable model. Live sync
     * begins only when the user opens a generated file (adoption).
     */
    async function openAllScripts(cmd: OpenScriptEditorsCommand, editorId: string): Promise<void> {
        if (cmd.scripts.length === 0) {
            deps.notifier.showInfo(NO_INLINE_SCRIPTS_MESSAGE);
            return;
        }

        const outcome = await materializeScriptBatch(cmd.scripts, (script) =>
            scriptEditor.materialize(
                new OpenScriptEditorCommand(
                    script.elementId,
                    "script-task",
                    undefined,
                    undefined,
                    script.scriptFormat,
                    script.content,
                    cmd.variables ?? [],
                ),
                editorId,
            ),
        );

        const folder = posix.join(deps.settings.getConfigFolder(), TMP_SCRIPTING_SEGMENT);
        deps.notifier.showInfo(scriptBatchSummary(outcome, folder));
    }

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
            deps.notifier.showInfo("Focus a BPMN diagram tab, then run the command again.");
        }
    });

    const scriptSession: EditorSessionParticipant = {
        onResolve(session: EditorSessionContext) {
            session.onDispose(() => scriptEditor.disposeEditor(session.editorId));
        },
    };

    return { participants: [scriptSession] };
}
