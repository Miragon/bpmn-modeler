import {
    DiffPaneHandle,
    DiffPaneStore,
    DiffSession,
    WebviewMessageRouter,
} from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import {
    DiffDisposeParams,
    DiffOpenParams,
    DiffWebviewMessageParams,
} from "../../../protocol/domain/types";
import { DiffPaneFactory } from "../../port/DiffPaneFactory";

/** RPC (Host → Core): diff/open, diff/webviewMessage, diff/dispose. */
export function diffHandlers({
    diffStore,
    paneRouter,
    createPane,
    log,
}: {
    diffStore: DiffPaneStore;
    paneRouter: WebviewMessageRouter<DiffPaneHandle>;
    createPane: DiffPaneFactory;
    log: (message: string) => void;
}): RpcHandlerTable {
    // Diff panes route by `paneUri` (a diff has two browsers, indexed
    // independently of editor sessions); `diffSessions` maps each `diffId` to
    // its session so `diff/dispose` can detach and drop both panes at once.
    const diffPanes = new Map<string, DiffPaneHandle>();
    const diffSessions = new Map<string, DiffSession>();

    return {
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
        [METHODS.diffOpen]: (params: DiffOpenParams) => {
            const beforeHandle = createPane(params.before.uri, params.before.content);
            const afterHandle = createPane(params.after.uri, params.after.content);

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

            log(`diff opened: ${params.diffId} (${params.origin})`);
        },
        [METHODS.diffWebviewMessage]: (params: DiffWebviewMessageParams) => {
            const handle = diffPanes.get(params.paneUri);
            if (handle) {
                void paneRouter.dispatch(params.message, handle);
            }
        },
        [METHODS.diffDispose]: (params: DiffDisposeParams) => {
            const session = diffSessions.get(params.diffId);
            if (!session) {
                return;
            }
            for (const pane of session.attachedPanes()) {
                diffPanes.delete(pane.uri);
                diffStore.detach(pane);
                pane.dispose();
            }
            diffSessions.delete(params.diffId);
            log(`diff disposed: ${params.diffId}`);
        },
    };
}
