import { BpmnDiffService, DiffPaneStore, DiffSession } from "@miragon/bpmn-modeler-core";

import { RpcDiffPaneHandle, dispatchDiffMessage } from "../diffAdapters";
import { METHODS } from "../protocol/descriptor";
import { DiffDisposeParams, DiffOpenParams, DiffWebviewMessageParams } from "../protocol/types";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The diff feature owns the production diff brain (`DiffPaneStore` +
 * `BpmnDiffService`) and the pane/session bookkeeping behind host-originated
 * `diff/*` RPC. Diff panes are not editor sessions, so they don't ride the
 * per-session settings hub; the locale is pushed on open and re-pushed on
 * `settings/didChange` via the returned `rebroadcastLanguage` handle (the
 * settings feature owns that route and calls back).
 *
 * RPC (Host → Core): diff/open, diff/webviewMessage, diff/dispose.
 */
export function register(deps: BridgeSharedDeps): { rebroadcastLanguage: () => void } {
    const diffStore = new DiffPaneStore();
    const diffService = new BpmnDiffService(deps.notifier, deps.settings, diffStore);

    // Diff panes route by `paneUri` (a diff has two browsers, indexed
    // independently of editor sessions); `diffSessions` maps each `diffId` to
    // its session so `diff/dispose` can detach and drop both panes at once.
    const diffPanes = new Map<string, RpcDiffPaneHandle>();
    const diffSessions = new Map<string, DiffSession>();

    /**
     * Host-originated diff start. Unlike VS Code — where the two panes resolve
     * independently and the controller has to pair them — IntelliJ hands us both
     * sides up front (it knows HEAD vs working tree), so we build the fully-armed
     * session in one shot: two handles seeded with cached XML, both attached,
     * indexed. Each pane's webview then boots, asks for its file, reports ready,
     * and `markReady` runs the differ once both sides are in. Sides are already
     * assigned by the host, so the `forScm`/`forCompareFiles` choice is made by
     * origin alone — only so the legend's origin-specific chrome stays correct.
     */
    deps.rpc.on(METHODS.diffOpen, (params: DiffOpenParams) => {
        const beforeHandle = new RpcDiffPaneHandle(
            params.before.uri,
            params.before.content,
            deps.rpc,
        );
        const afterHandle = new RpcDiffPaneHandle(params.after.uri, params.after.content, deps.rpc);

        const session =
            params.origin === "scm"
                ? DiffSession.forScm(beforeHandle, afterHandle)
                : DiffSession.forCompareFiles(params.before.uri, params.after.uri);
        session.attachPane(beforeHandle);
        session.attachPane(afterHandle);
        diffStore.index(session);

        diffPanes.set(beforeHandle.uri, beforeHandle);
        diffPanes.set(afterHandle.uri, afterHandle);
        diffSessions.set(params.diffId, session);

        deps.log(`diff opened: ${params.diffId} (${params.origin})`);
    });

    deps.rpc.on(METHODS.diffWebviewMessage, (params: DiffWebviewMessageParams) => {
        const handle = diffPanes.get(params.paneUri);
        if (handle) {
            void dispatchDiffMessage(diffService, handle, params.message);
        }
    });

    deps.rpc.on(METHODS.diffDispose, (params: DiffDisposeParams) => {
        const session = diffSessions.get(params.diffId);
        if (!session) {
            return;
        }
        for (const pane of session.attachedPanes()) {
            diffPanes.delete(pane.uri);
            session.detachPane(pane);
            pane.dispose();
        }
        diffStore.remove(session);
        diffSessions.delete(params.diffId);
        deps.log(`diff disposed: ${params.diffId}`);
    });

    return { rebroadcastLanguage: () => diffService.rebroadcastLanguage() };
}
