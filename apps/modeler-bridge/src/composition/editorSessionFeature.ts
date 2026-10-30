import { BpmnEditorFeature, EditorSessionLifecycle } from "@miragon/bpmn-modeler-core";

import { RpcEditorHandle } from "../adapters";
import { METHODS } from "../protocol/descriptor";
import {
    DocumentDidChangeParams,
    EditorRefParams,
    RegisterParams,
    WebviewMessageParams,
} from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The editor-session feature is the bridge's lifecycle hub: the per-editor
 * handle registry, document sync, and the register/dispose RPC. It runs the
 * BPMN editor's router and participants through the same
 * {@link EditorSessionLifecycle} as VS Code, so this module drives the
 * lifecycle without knowing any of them.
 *
 * RPC (Host → Core): session/register, session/setActive, session/dispose,
 * webview/message, document/didChange.
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

    type RegisteredHandle = { handle: RpcEditorHandle; sessionId?: number };
    const handles = new Map<string, RegisteredHandle>();
    const matches = (entry: RegisteredHandle | undefined, sessionId?: number): boolean =>
        entry !== undefined && (sessionId === undefined || entry.sessionId === sessionId);

    // The store's active editor is the bridge's focus: the host reports the
    // focused tab through `session/setActive`.
    deps.store.onDidChangeActiveEditor((activeId) => {
        for (const { handle } of handles.values()) handle.setActive(handle.id === activeId);
    });

    // Unregistering disposes the handle, which runs every participant's teardown.
    const disposeRegisteredSession = (editorId: string, entry: RegisteredHandle): void => {
        const workspaceRoot = deps.mirror.peek(editorId)?.workspaceRoot;
        deps.store.unregister(editorId, entry.handle);
        if (workspaceRoot) deps.nodeWorkspace.unregisterRoot(workspaceRoot);
        if (handles.get(editorId) === entry) handles.delete(editorId);
        deps.mirror.remove(editorId);
    };

    deps.rpc.on(METHODS.sessionRegister, async (params: RegisterParams) => {
        const existing = handles.get(params.editorId);

        // Seed settings before any discovery so `getConfigFolder()` is correct on
        // the first template scan/watcher. Snapshots are host-global; applying the
        // same one on each register is idempotent. Kept inline (settings is a
        // shared seam) so it precedes every participant.
        if (params.settings) {
            deps.settings.apply(params.settings);
        }

        if (existing && params.sessionId !== undefined && existing.sessionId === params.sessionId) {
            deps.mirror.register(params, params.content);
            deps.store.setHostDocumentRevision(params.editorId, params.documentRevision ?? 0);
            await lifecycle.reseed(params.editorId);
            deps.log(`session re-seeded: ${params.editorId}`);
            return;
        }

        if (existing) disposeRegisteredSession(params.editorId, existing);

        deps.mirror.register(params, params.content);
        const handle = new RpcEditorHandle(params, deps.mirror, deps.rpc, deps.settings);
        handles.set(params.editorId, { handle, sessionId: params.sessionId });

        // The host registers the tab it opens, so the session counts as focused. Set
        // before registering so the store treats it as focused and gives it the target.
        handle.setActive(true);
        deps.store.register(handle);
        deps.store.setHostDocumentRevision(params.editorId, params.documentRevision ?? 0);

        // Seed discovery with the host's authoritative root before the
        // participants arm their watchers.
        if (params.workspaceRoot) {
            deps.nodeWorkspace.registerRoot(params.workspaceRoot);
        }

        // Awaited to preserve the promise chain `rpc.handleLine` sees (e.g. the
        // template watcher's async creation).
        await lifecycle.open(params.editorId);

        deps.log(`session registered: ${params.editorId}`);
    });

    deps.rpc.on(METHODS.webviewMessage, (params: WebviewMessageParams) => {
        const entry = handles.get(params.editorId);
        if (matches(entry, params.sessionId)) entry?.handle.receive(params.message);
    });

    // External edits (git revert/checkout, the IDE's plain-text tab, another
    // tool) must re-render the open diagram. The host never echoes the core's own
    // `document/write` here (its reply updates the mirror instead), so every
    // change is external. The core's `ModelerSession` guard stays as a second
    // line of defence.
    deps.rpc.on(METHODS.documentDidChange, async (params: DocumentDidChangeParams) => {
        const entry = handles.get(params.editorId);
        if (!matches(entry, params.sessionId)) return;
        if (
            params.documentRevision !== undefined &&
            !deps.store.setHostDocumentRevision(params.editorId, params.documentRevision)
        ) {
            return;
        }
        deps.mirror.setContent(params.editorId, params.content);
        await editor.bpmnService.display(params.editorId, params.documentRevision === undefined);
    });

    // The host reports which editor tab is focused so the store's active-editor
    // pointer stays correct with several `.bpmn` files open (commands/diff that
    // target "the active editor" depend on it).
    deps.rpc.on(METHODS.sessionSetActive, (params: EditorRefParams) => {
        if (matches(handles.get(params.editorId), params.sessionId)) {
            deps.store.setActiveEditor(params.editorId);
        }
    });

    deps.rpc.on(METHODS.sessionDispose, (params: EditorRefParams) => {
        const entry = handles.get(params.editorId);
        if (!matches(entry, params.sessionId) || !entry) return;
        disposeRegisteredSession(params.editorId, entry);
        deps.log(`session disposed: ${params.editorId}`);
    });
}
