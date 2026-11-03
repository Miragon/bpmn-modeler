import { BpmnEditorFeature, EditorSessionLifecycle } from "@miragon/bpmn-modeler-core";

import { RpcEditorHandle } from "../editorSession/adapter/out/RpcEditorHandle";
import { editorSessionHandlers } from "../editorSession/adapter/in/editorSessionHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The editor-session feature is the bridge's lifecycle hub: the per-editor
 * handle registry, document sync, and the register/dispose RPC. It runs the
 * BPMN editor's router and participants through the same
 * {@link EditorSessionLifecycle} as VS Code, so this module drives the
 * lifecycle without knowing any of them.
 */
export function register(
    deps: BridgeSharedDeps,
    editor: Pick<BpmnEditorFeature, "bpmnService" | "router" | "participants">,
): void {
    const lifecycle = new EditorSessionLifecycle(
        deps.store,
        deps.notifier,
        editor.router,
        editor.participants,
    );

    bindHandlers(
        deps.rpc,
        editorSessionHandlers({
            store: deps.store,
            lifecycle,
            mirror: deps.mirror,
            settingsMirror: deps.settings,
            workspaceRoots: deps.nodeWorkspace,
            createEditorHandle: (session) =>
                new RpcEditorHandle(session, deps.mirror, deps.rpc, deps.settings),
            bpmnService: editor.bpmnService,
            log: deps.log,
        }),
    );
}
