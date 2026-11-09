import {
    BpmnModelerService,
    EditorSessionLifecycle,
    EditorSessionStore,
} from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import {
    DocumentDidChangeParams,
    EditorRefParams,
    RegisterParams,
    WebviewMessageParams,
} from "../../../protocol/domain/types";
import { PluginApprovalsMirror } from "../../../bpmnPlugins/port/PluginApprovalsMirror";
import { HostSettingsMirror } from "../../../kernel/port/HostSettingsMirror";
import { WorkspaceRoots } from "../../../kernel/port/WorkspaceRoots";
import { DocumentMirror } from "../../domain/DocumentMirror";
import { HostEditorHandle, HostEditorHandleFactory } from "../../port/HostEditorHandle";

/**
 * The per-editor handle registry and the document sync of the host's editor
 * tabs.
 *
 * RPC (Host → Core): session/register, session/setActive, session/dispose,
 * webview/message, document/didChange.
 */
export function editorSessionHandlers({
    store,
    lifecycle,
    mirror,
    settingsMirror,
    pluginApprovals,
    workspaceRoots,
    createEditorHandle,
    bpmnService,
    log,
}: {
    store: EditorSessionStore;
    lifecycle: EditorSessionLifecycle;
    mirror: DocumentMirror;
    settingsMirror: HostSettingsMirror;
    pluginApprovals: PluginApprovalsMirror;
    workspaceRoots: WorkspaceRoots;
    createEditorHandle: HostEditorHandleFactory;
    bpmnService: Pick<BpmnModelerService, "display">;
    log: (message: string) => void;
}): RpcHandlerTable {
    type RegisteredHandle = { handle: HostEditorHandle; sessionId?: number };
    const handles = new Map<string, RegisteredHandle>();
    const matches = (entry: RegisteredHandle | undefined, sessionId?: number): boolean =>
        entry !== undefined && (sessionId === undefined || entry.sessionId === sessionId);

    // The store's active editor is the bridge's focus: the host reports the
    // focused tab through `session/setActive`.
    store.onDidChangeActiveEditor((activeId) => {
        for (const { handle } of handles.values()) handle.setActive(handle.id === activeId);
    });

    // Unregistering disposes the handle, which runs every participant's teardown.
    const disposeRegisteredSession = (editorId: string, entry: RegisteredHandle): void => {
        const workspaceRoot = mirror.peek(editorId)?.workspaceRoot;
        store.unregister(editorId, entry.handle);
        if (workspaceRoot) workspaceRoots.unregisterRoot(workspaceRoot);
        if (handles.get(editorId) === entry) handles.delete(editorId);
        mirror.remove(editorId);
    };

    return {
        [METHODS.sessionRegister]: async (params: RegisterParams) => {
            const existing = handles.get(params.editorId);

            // Seed settings before any discovery so `getConfigFolder()` is correct on
            // the first template scan/watcher. Snapshots are host-global; applying the
            // same one on each register is idempotent. Kept inline (settings is a
            // shared seam) so it precedes every participant.
            if (params.settings) {
                settingsMirror.apply(params.settings);
            }
            // Seeded here rather than at startup, so it cannot race the first plugin request.
            if (params.pluginApprovals && params.pluginApprovalsRevision !== undefined) {
                pluginApprovals.apply({
                    approvals: params.pluginApprovals,
                    revision: params.pluginApprovalsRevision,
                });
            }

            if (
                existing &&
                params.sessionId !== undefined &&
                existing.sessionId === params.sessionId
            ) {
                mirror.register(params, params.content);
                store.setHostDocumentRevision(params.editorId, params.documentRevision ?? 0);
                await lifecycle.reseed(params.editorId);
                log(`session re-seeded: ${params.editorId}`);
                return;
            }

            if (existing) disposeRegisteredSession(params.editorId, existing);

            mirror.register(params, params.content);
            const handle = createEditorHandle(params);
            handles.set(params.editorId, { handle, sessionId: params.sessionId });

            // The host registers the tab it opens, so the session counts as focused. Set
            // before registering so the store treats it as focused and gives it the target.
            handle.setActive(true);
            store.register(handle);
            store.setHostDocumentRevision(params.editorId, params.documentRevision ?? 0);

            // Seed discovery with the host's authoritative root before the
            // participants arm their watchers.
            if (params.workspaceRoot) {
                workspaceRoots.registerRoot(params.workspaceRoot);
            }

            // Awaited to preserve the promise chain `rpc.handleLine` sees (e.g. the
            // template watcher's async creation).
            await lifecycle.open(params.editorId);

            log(`session registered: ${params.editorId}`);
        },

        [METHODS.webviewMessage]: (params: WebviewMessageParams) => {
            const entry = handles.get(params.editorId);
            if (matches(entry, params.sessionId)) entry?.handle.receive(params.message);
        },

        // External edits (git revert/checkout, the IDE's plain-text tab, another
        // tool) must re-render the open diagram. The host never echoes the core's own
        // `document/write` here (its reply updates the mirror instead), so every
        // change is external. The core's `ModelerSession` guard stays as a second
        // line of defence.
        [METHODS.documentDidChange]: async (params: DocumentDidChangeParams) => {
            const entry = handles.get(params.editorId);
            if (!matches(entry, params.sessionId)) return;
            if (
                params.documentRevision !== undefined &&
                !store.setHostDocumentRevision(params.editorId, params.documentRevision)
            ) {
                return;
            }
            mirror.setContent(params.editorId, params.content);
            await bpmnService.display(params.editorId, params.documentRevision === undefined);
        },

        // The host reports which editor tab is focused so the store's active-editor
        // pointer stays correct with several `.bpmn` files open (commands/diff that
        // target "the active editor" depend on it).
        [METHODS.sessionSetActive]: (params: EditorRefParams) => {
            if (matches(handles.get(params.editorId), params.sessionId)) {
                store.setActiveEditor(params.editorId);
            }
        },

        [METHODS.sessionDispose]: (params: EditorRefParams) => {
            const entry = handles.get(params.editorId);
            if (!matches(entry, params.sessionId) || !entry) return;
            disposeRegisteredSession(params.editorId, entry);
            log(`session disposed: ${params.editorId}`);
        },
    };
}
