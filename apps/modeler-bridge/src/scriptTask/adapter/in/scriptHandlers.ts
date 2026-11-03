import {
    EditorSessionStore,
    FOCUS_BPMN_DIAGRAM_MESSAGE,
    NotifierPort,
} from "@miragon/bpmn-modeler-core";
import { OpenAllScriptTasksQuery } from "@miragon/bpmn-modeler-shared";

import { METHODS } from "../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import {
    ScriptCloseParams,
    ScriptDidChangeParams,
    ScriptDidOpenExternalParams,
} from "../../../protocol/domain/types";
import { ScriptTabEvents } from "../../port/ScriptTabEvents";

/**
 * RPC (Host → Core): script/didChange, script/didClose, script/didOpenExternal,
 * script/openAll.
 */
export function scriptHandlers({
    scriptTabs,
    store,
    notifier,
}: {
    scriptTabs: ScriptTabEvents;
    store: EditorSessionStore;
    notifier: NotifierPort;
}): RpcHandlerTable {
    return {
        // The host edited an open script tab → push the new content into the owning
        // BPMN webview, which writes it to the moddle property via bpmn-js.
        [METHODS.scriptDidChange]: (params: ScriptDidChangeParams) => {
            scriptTabs.didChange(params.scriptId, params.content);
        },
        // A script tab closed on the host (user close, or the ack of our own
        // script/close) → drop tracking so a re-open re-reads the current BPMN
        // content, and delete the on-disk file now that the host's flush-save
        // is guaranteed to have finished. Returned (not `void`ed) so the dispatcher
        // awaits the debounce flush before the frame is considered handled.
        [METHODS.scriptDidClose]: (params: ScriptCloseParams) =>
            scriptTabs.didClose(params.scriptId),
        // The host reported a script file opened outside our own `script/open` flow
        // (Project view, or the panel button on an untracked file) → adopt it so
        // keystrokes stream into the owning BPMN webview from now on.
        [METHODS.scriptDidOpenExternal]: (params: ScriptDidOpenExternalParams) =>
            scriptTabs.adoptExternalOpen(params.filePath),
        // Tools ▸ Generate Script Files for Script Tasks → ask the active BPMN webview
        // for its inline script tasks. No active editor means no BPMN tab is focused;
        // guide the user rather than surfacing the raw throw.
        [METHODS.scriptOpenAll]: async () => {
            try {
                const editorId = store.getActiveEditorId();
                await store.postMessage(editorId, new OpenAllScriptTasksQuery());
            } catch (error) {
                notifier.logError(error instanceof Error ? error : new Error(String(error)));
                notifier.showInfo(FOCUS_BPMN_DIAGRAM_MESSAGE);
            }
        },
    };
}
