import { Command, Query, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";
import { BpmnModelerService } from "@miragon/bpmn-modeler-core";

import { RpcEditorHandle } from "../adapters";
import { METHODS } from "../protocol/descriptor";
import {
    DocumentDidChangeParams,
    EditorRefParams,
    RegisterParams,
    WebviewMessageParams,
} from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";
import { SessionHooks } from "./sessionHooks";

/** Builds a typed-but-stub host reply. The webview only reads `.type`, so a plain object is enough. */
function query(type: string, fields: Record<string, unknown>): Query {
    return { type, ...fields } as unknown as Query;
}

/**
 * The editor-session feature is the bridge's lifecycle hub: it owns
 * {@link BpmnModelerService}, the per-editor handle registry, document sync, and
 * the register/dispose RPC. Sibling features contribute their per-session state
 * through {@link SessionHooks} (template watchers, script tabs, code-link maps),
 * so this module drives the lifecycle without importing any of them — hooks flow
 * backward, handles flow forward.
 *
 * Webview messages: GetBpmnFileCommand, SyncDocumentCommand,
 * GetPropertiesPanelStateCommand.
 * RPC (Host → Core): session/register, session/setActive, session/dispose,
 * webview/message, document/didChange.
 */
export function register(deps: BridgeSharedDeps, sessionHooks: SessionHooks[]): void {
    const bpmnService = new BpmnModelerService(
        deps.store,
        deps.documentPort,
        deps.picker,
        deps.statusBar,
        deps.notifier,
    );

    const handles = new Map<string, RpcEditorHandle>();

    deps.router
        .on("GetBpmnFileCommand", async (_message: Command, editorId: string) => {
            if (await bpmnService.display(editorId)) {
                deps.notifier.logInfo("BPMN modeler is ready");
            }
        })
        .on("SyncDocumentCommand", async (message: Command, editorId: string) => {
            await bpmnService.sync(editorId, (message as SyncDocumentCommand).content);
        })
        // The remaining handshake reply is a bridge-level stub because its real
        // service (properties panel) is not wired on this host path. It must still
        // answer, or the webview's `Promise.all` over templates+settings+panel-state
        // never resolves and bootstrap stalls.
        .on("GetPropertiesPanelStateCommand", (_m: Command, editorId: string) => {
            deps.store.postMessage(editorId, query("PropertiesPanelStateQuery", { visible: true }));
        });

    deps.rpc.on(METHODS.sessionRegister, async (params: RegisterParams) => {
        // Seed settings before any discovery so `getConfigFolder()` is correct on
        // the first template scan/watcher. Snapshots are host-global; applying the
        // same one on each register is idempotent. Kept inline (settings is a
        // shared seam) so it precedes every hook.
        if (params.settings) {
            deps.settings.apply(params.settings);
        }

        deps.mirror.register(params, params.content);
        const handle = new RpcEditorHandle(params, deps.mirror, deps.rpc, deps.settings);
        handles.set(params.editorId, handle);

        // Same wiring the VS Code controller does: route incoming webview
        // messages through the store into the router, and arm the echo-prevention
        // session.
        deps.store.register(handle);
        deps.store.subscribeToMessageEvent(params.editorId, (message, editorId) =>
            deps.router.dispatch(message, editorId),
        );
        bpmnService.registerSession(params.editorId);

        // Seed discovery with the host's authoritative root before the hooks run.
        // Hoisted above the hook loop is safe: the hooks it now precedes only
        // register callbacks (broadcaster subscribe + configFolder listener) or
        // arm the watcher, none of which read the root synchronously.
        if (params.workspaceRoot) {
            deps.nodeWorkspace.registerRoot(params.workspaceRoot);
        }

        // Hooks run last and are awaited to preserve the promise chain
        // `rpc.handleLine` sees (e.g. the template watcher's async creation).
        for (const hooks of sessionHooks) {
            await hooks.onSessionRegistered?.(params);
        }

        deps.log(`session registered: ${params.editorId}`);
    });

    deps.rpc.on(METHODS.webviewMessage, (params: WebviewMessageParams) => {
        handles.get(params.editorId)?.receive(params.message);
    });

    // External edits (git revert/checkout, the IDE's plain-text tab, another
    // tool) must re-render the open diagram. The host stays dumb and forwards
    // *every* document change — including the echo of our own `document/write` —
    // so the bridge classifies them here: `RpcDocumentPort.write` updates the
    // mirror to the core-originated content before the RPC round-trip, so an
    // unchanged compare means this is that echo and re-rendering would loop.
    // Only a genuinely different text is an external edit worth displaying.
    deps.rpc.on(METHODS.documentDidChange, async (params: DocumentDidChangeParams) => {
        if (deps.mirror.content(params.editorId) === params.content) {
            return;
        }
        deps.mirror.setContent(params.editorId, params.content);
        await bpmnService.display(params.editorId);
    });

    // The host reports which editor tab is focused so the store's active-editor
    // pointer stays correct with several `.bpmn` files open (commands/diff that
    // target "the active editor" depend on it).
    deps.rpc.on(METHODS.sessionSetActive, (params: EditorRefParams) => {
        deps.store.setActiveEditor(params.editorId);
    });

    deps.rpc.on(METHODS.sessionDispose, (params: EditorRefParams) => {
        bpmnService.disposeSession(params.editorId);

        // Per-session teardown owned by sibling features (script tabs, code-link
        // map, template watcher), in the array order `createBridge` fixes.
        for (const hooks of sessionHooks) {
            hooks.onSessionDisposed?.(params.editorId);
        }

        // Read the root before removing the mirror entry that holds it.
        const workspaceRoot = deps.mirror.peek(params.editorId)?.workspaceRoot;
        if (workspaceRoot) {
            deps.nodeWorkspace.unregisterRoot(workspaceRoot);
        }
        handles.get(params.editorId)?.dispose();
        handles.delete(params.editorId);
        deps.mirror.remove(params.editorId);
        deps.log(`session disposed: ${params.editorId}`);
    });
}
