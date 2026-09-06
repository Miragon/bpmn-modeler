import { basename } from "node:path";

import { Command, Query, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";
import { BpmnModelerService, registerWebviewLogHandlers } from "@miragon/bpmn-modeler-core";

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
export function register(
    deps: BridgeSharedDeps,
    sessionHooks: SessionHooks[],
): { bpmnService: BpmnModelerService } {
    const bpmnService = new BpmnModelerService(
        deps.store,
        deps.documentPort,
        deps.picker,
        deps.statusBar,
        deps.notifier,
        deps.settings,
    );

    type RegisteredHandle = { handle: RpcEditorHandle; sessionId?: number };
    const handles = new Map<string, RegisteredHandle>();
    const matches = (entry: RegisteredHandle | undefined, sessionId?: number): boolean =>
        entry !== undefined && (sessionId === undefined || entry.sessionId === sessionId);

    deps.router
        .on("GetBpmnFileCommand", async (_message: Command, editorId: string) => {
            if (await bpmnService.display(editorId)) {
                deps.notifier.logDebug("BPMN modeler is ready");
            }
        })
        .on("SyncDocumentCommand", async (message: Command, editorId: string) => {
            const sync = message as SyncDocumentCommand;
            await bpmnService.sync(editorId, sync.content, sync.documentRevision);
        })
        // The remaining handshake reply is a bridge-level stub because its real
        // service (properties panel) is not wired on this host path. It must still
        // answer, or the webview's `Promise.all` over templates+settings+panel-state
        // never resolves and bootstrap stalls.
        .on("GetPropertiesPanelStateCommand", (_m: Command, editorId: string) => {
            deps.store.postMessage(editorId, query("PropertiesPanelStateQuery", { visible: true }));
        });

    // Route the webview's Log*Commands into `idea.log` via the notifier/log RPC.
    // Tag each line with the diagram's basename so a warning is correlatable when
    // several editors are open; getFilePath throws for an unknown editorId.
    const resolveSource = (editorId: string): string | undefined => {
        try {
            return basename(deps.documentPort.getFilePath(editorId));
        } catch {
            return undefined;
        }
    };
    registerWebviewLogHandlers(deps.router, deps.notifier, resolveSource);

    const disposeRegisteredSession = (editorId: string, entry: RegisteredHandle): void => {
        bpmnService.disposeSession(editorId);
        for (const hooks of sessionHooks) {
            hooks.onSessionDisposed?.(editorId);
        }
        const workspaceRoot = deps.mirror.peek(editorId)?.workspaceRoot;
        if (workspaceRoot) deps.nodeWorkspace.unregisterRoot(workspaceRoot);
        deps.store.unregister(editorId, entry.handle);
        if (handles.get(editorId) === entry) handles.delete(editorId);
        deps.mirror.remove(editorId);
    };

    deps.rpc.on(METHODS.sessionRegister, async (params: RegisterParams) => {
        const existing = handles.get(params.editorId);

        // Seed settings before any discovery so `getConfigFolder()` is correct on
        // the first template scan/watcher. Snapshots are host-global; applying the
        // same one on each register is idempotent. Kept inline (settings is a
        // shared seam) so it precedes every hook.
        if (params.settings) {
            deps.settings.apply(params.settings);
        }

        if (existing && params.sessionId !== undefined && existing.sessionId === params.sessionId) {
            deps.mirror.register(params, params.content);
            deps.store.setHostDocumentRevision(params.editorId, params.documentRevision ?? 0);
            for (const hooks of sessionHooks) {
                await hooks.onSessionReseeded?.(params);
            }
            deps.log(`session re-seeded: ${params.editorId}`);
            return;
        }

        if (existing) disposeRegisteredSession(params.editorId, existing);

        deps.mirror.register(params, params.content);
        const handle = new RpcEditorHandle(params, deps.mirror, deps.rpc, deps.settings);
        handles.set(params.editorId, { handle, sessionId: params.sessionId });

        // Same wiring the VS Code controller does: route incoming webview
        // messages through the store into the router, and arm the echo-prevention
        // session.
        deps.store.register(handle);
        deps.store.setHostDocumentRevision(params.editorId, params.documentRevision ?? 0);
        // The bridge (unlike VS Code's ModelerEditorController) doesn't wrap the
        // dispatch, so a rejected handler — now that commit 2 makes handlers return
        // their service promise — would surface as a Node unhandled rejection.
        deps.store.subscribeToMessageEvent(params.editorId, (message, editorId) =>
            deps.router.dispatch(message, editorId).catch((error) => {
                deps.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            }),
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
        const entry = handles.get(params.editorId);
        if (matches(entry, params.sessionId)) entry?.handle.receive(params.message);
    });

    // External edits (git revert/checkout, the IDE's plain-text tab, another
    // tool) must re-render the open diagram. The host stays dumb and forwards
    // *every* document change — including the echo of our own `document/write` —
    // so the bridge classifies them here by explicit causation (LSP-style
    // versioned `didChange`): each `document/write` mints a per-editor revision
    // the host echoes back as `causedBy`, so an echo carries a revision the
    // mirror still holds as pending and is dropped. An external edit carries no
    // `causedBy` (or a stale/unknown one) and renders. The core's
    // `ModelerSession` guard stays as a second line of defence.
    deps.rpc.on(METHODS.documentDidChange, async (params: DocumentDidChangeParams) => {
        const entry = handles.get(params.editorId);
        if (!matches(entry, params.sessionId)) return;
        const ownEcho =
            params.causedBy != null &&
            deps.mirror.isOwnEcho(params.editorId, params.causedBy, params.sessionId);
        if (
            params.documentRevision !== undefined &&
            !deps.store.setHostDocumentRevision(params.editorId, params.documentRevision)
        ) {
            return;
        }
        deps.mirror.setContent(params.editorId, params.content);
        if (ownEcho) return; // retain authoritative bytes without re-rendering our write
        await bpmnService.display(params.editorId, params.documentRevision === undefined);
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

    // Exposed so the commands feature can reuse the same service instance for the
    // engine-version change (it shares the store/document mirror this feature owns).
    return { bpmnService };
}
