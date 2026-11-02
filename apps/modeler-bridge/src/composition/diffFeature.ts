import {
    BpmnDiffService,
    DiffPaneHandle,
    DiffPaneStore,
    WebviewMessageRouter,
    createDiffPaneRouter,
} from "@miragon/bpmn-modeler-core";

import { RpcDiffPaneHandle } from "../diff/adapter/out/RpcDiffPaneHandle";
import { diffHandlers } from "../diff/adapter/in/diffHandlers";
import { bindHandlers } from "./bindHandlers";
import { BridgeSharedDeps } from "./sharedDeps";

/**
 * The diff feature owns the production diff brain (`DiffPaneStore` +
 * `BpmnDiffService`) and the pane/session bookkeeping behind host-originated
 * `diff/*` RPC. Diff panes are not editor sessions, so they don't ride the
 * per-session settings hub; the locale is pushed on open and re-pushed on
 * `settings/didChange` via the returned `rebroadcastLanguage` handle (the
 * settings feature owns that route and calls back).
 */
export function register(deps: BridgeSharedDeps): {
    rebroadcastLanguage: () => void;
    paneRoutes: Pick<WebviewMessageRouter<DiffPaneHandle>, "routeOf">;
} {
    const diffStore = new DiffPaneStore();
    const diffService = new BpmnDiffService(deps.notifier, deps.settings, diffStore);
    // IntelliJ's diff viewer swaps the sides itself, so the swap never reaches the bridge.
    const paneRouter = createDiffPaneRouter(diffService, { paneLog: deps.notifier });

    bindHandlers(
        deps.rpc,
        diffHandlers({
            diffStore,
            paneRouter,
            createPane: (uri, content) => new RpcDiffPaneHandle(uri, content, deps.rpc),
            log: deps.log,
        }),
    );

    return {
        rebroadcastLanguage: () => diffService.rebroadcastLanguage(),
        paneRoutes: paneRouter,
    };
}
