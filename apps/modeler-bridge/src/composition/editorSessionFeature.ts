import { basename } from "node:path";

import { Command, Query, SyncDocumentCommand } from "@miragon/bpmn-modeler-shared";
import {
    BpmnModelerService,
    DmnModelerService,
    DmnSettingsBroadcaster,
    registerWebviewLogHandlers,
} from "@miragon/bpmn-modeler-core";

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
 * Both the BPMN and the DMN modeler ride this one lifecycle hub. The session's
 * {@link RegisterParams.kind} (from `session/register`) decides which service a
 * given editor's render/sync routes to; the DMN path additionally skips the
 * BPMN-only session hooks (template watcher, script tabs, code-link) since none
 * of them apply to a decision table.
 *
 * Webview messages: GetBpmnFileCommand, GetDmnFileCommand,
 * GetDmnModelerSettingCommand, SyncDocumentCommand, GetPropertiesPanelStateCommand.
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
    );
    const dmnService = new DmnModelerService(deps.store, deps.documentPort, deps.notifier);
    const dmnSettings = new DmnSettingsBroadcaster(deps.store, deps.settings, deps.notifier);

    const handles = new Map<string, RpcEditorHandle>();

    // Which modeler owns each open editor. Seeded on register, read by the shared
    // SyncDocumentCommand / document/didChange paths to pick the right service.
    // Absent ⇒ bpmn (see RegisterParams.kind).
    const sessionKinds = new Map<string, "bpmn" | "dmn">();
    const kindOf = (editorId: string): "bpmn" | "dmn" => sessionKinds.get(editorId) ?? "bpmn";

    deps.router
        .on("GetBpmnFileCommand", async (_message: Command, editorId: string) => {
            if (await bpmnService.display(editorId)) {
                deps.notifier.logDebug("BPMN modeler is ready");
            }
        })
        .on("GetDmnFileCommand", async (_message: Command, editorId: string) => {
            if (await dmnService.display(editorId)) {
                deps.notifier.logDebug("DMN modeler is ready");
            }
        })
        // The DMN webview asks for its color-theme preference during bootstrap;
        // without a reply its `Promise.all` over file+settings+panel-state never
        // resolves and the editor stays blank (same handshake contract as BPMN).
        .on("GetDmnModelerSettingCommand", async (_message: Command, editorId: string) => {
            await dmnSettings.setSettings(editorId);
        })
        // Both modelers emit SyncDocumentCommand; route to the service that owns
        // this editor so a DMN write can't run through the BPMN service (its
        // session guard / status bar) and vice versa.
        .on("SyncDocumentCommand", async (message: Command, editorId: string) => {
            const content = (message as SyncDocumentCommand).content;
            if (kindOf(editorId) === "dmn") {
                await dmnService.sync(editorId, content);
            } else {
                await bpmnService.sync(editorId, content);
            }
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

    deps.rpc.on(METHODS.sessionRegister, async (params: RegisterParams) => {
        // Seed settings before any discovery so `getConfigFolder()` is correct on
        // the first template scan/watcher. Snapshots are host-global; applying the
        // same one on each register is idempotent. Kept inline (settings is a
        // shared seam) so it precedes every hook.
        if (params.settings) {
            deps.settings.apply(params.settings);
        }

        const kind = params.kind ?? "bpmn";
        sessionKinds.set(params.editorId, kind);

        deps.mirror.register(params, params.content);
        const handle = new RpcEditorHandle(params, deps.mirror, deps.rpc, deps.settings);
        handles.set(params.editorId, handle);

        // Same wiring the VS Code controller does: route incoming webview
        // messages through the store into the router, and arm the echo-prevention
        // session.
        deps.store.register(handle);
        // The bridge (unlike VS Code's ModelerEditorController) doesn't wrap the
        // dispatch, so a rejected handler — now that commit 2 makes handlers return
        // their service promise — would surface as a Node unhandled rejection.
        deps.store.subscribeToMessageEvent(params.editorId, (message, editorId) =>
            deps.router.dispatch(message, editorId).catch((error) => {
                deps.notifier.logError(error instanceof Error ? error : new Error(String(error)));
            }),
        );

        if (kind === "dmn") {
            // The DMN surface only needs render-guard tracking and the theme
            // broadcaster; element templates, script tabs and code-link are BPMN
            // concepts, so their hooks stay out of the DMN path entirely.
            dmnService.registerSession(params.editorId);
            dmnSettings.subscribe(params.editorId);
            deps.log(`session registered (dmn): ${params.editorId}`);
            return;
        }

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
    // so the bridge classifies them here by explicit causation (LSP-style
    // versioned `didChange`): each `document/write` mints a per-editor revision
    // the host echoes back as `causedBy`, so an echo carries a revision the
    // mirror still holds as pending and is dropped. An external edit carries no
    // `causedBy` (or a stale/unknown one) and renders. The core's
    // `ModelerSession` guard stays as a second line of defence.
    deps.rpc.on(METHODS.documentDidChange, async (params: DocumentDidChangeParams) => {
        if (params.causedBy != null && deps.mirror.isOwnEcho(params.editorId, params.causedBy)) {
            return; // our own write echoed back — re-rendering would loop
        }
        deps.mirror.setContent(params.editorId, params.content);
        if (kindOf(params.editorId) === "dmn") {
            await dmnService.display(params.editorId);
        } else {
            await bpmnService.display(params.editorId);
        }
    });

    // The host reports which editor tab is focused so the store's active-editor
    // pointer stays correct with several `.bpmn` files open (commands/diff that
    // target "the active editor" depend on it).
    deps.rpc.on(METHODS.sessionSetActive, (params: EditorRefParams) => {
        deps.store.setActiveEditor(params.editorId);
    });

    deps.rpc.on(METHODS.sessionDispose, (params: EditorRefParams) => {
        const kind = kindOf(params.editorId);
        sessionKinds.delete(params.editorId);

        if (kind === "dmn") {
            // Mirror of the DMN register branch: only the render-guard session was
            // created (the theme subscription is torn down with the store handle
            // below), so no BPMN hooks / workspace-root unregister run here.
            dmnService.disposeSession(params.editorId);
            handles.get(params.editorId)?.dispose();
            handles.delete(params.editorId);
            deps.mirror.remove(params.editorId);
            deps.log(`session disposed (dmn): ${params.editorId}`);
            return;
        }

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

    // Exposed so the commands feature can reuse the same service instance for the
    // engine-version change (it shares the store/document mirror this feature owns).
    return { bpmnService };
}
