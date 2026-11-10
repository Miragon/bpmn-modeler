import { AddOnsFeature, AddOnsPanel } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import { AddOnsOpenParams, AddOnsWebviewMessageParams } from "../../../protocol/domain/types";
import { HostSettingsMirror } from "../../../kernel/port/HostSettingsMirror";
import { WorkspaceRoots } from "../../../kernel/port/WorkspaceRoots";

/** RPC (Host → Core): addOns/webviewMessage, addOns/open, addOns/refresh, addOns/review. */
export function addOnsHandlers({
    addOns,
    panel,
    settingsMirror,
    workspaceRoots,
    log,
}: {
    addOns: Pick<AddOnsFeature, "refresh" | "revealNeedsReview">;
    panel: AddOnsPanel;
    settingsMirror: HostSettingsMirror;
    workspaceRoots: WorkspaceRoots;
    log: (message: string) => void;
}): RpcHandlerTable {
    // Never released: the view lists the project after its last editor closed, and the process ends with the project.
    let claimedRoot: string | undefined;
    const claim = (root: string | undefined): void => {
        if (root === undefined || root === claimedRoot) return;
        if (claimedRoot !== undefined) workspaceRoots.unregisterRoot(claimedRoot);
        workspaceRoots.registerRoot(root);
        claimedRoot = root;
    };

    return {
        [METHODS.addOnsWebviewMessage]: (params: AddOnsWebviewMessageParams) => {
            void panel.handle(params.message).catch((error: unknown) => {
                log(`The add-ons view message failed: ${String(error)}`);
            });
        },
        // Settings ride here: an open queued while the bridge was down drains before
        // the spawn's settings/didChange.
        [METHODS.addOnsOpen]: (params: AddOnsOpenParams) => {
            settingsMirror.apply(params.settings);
            claim(params.workspaceRoot);
            panel.setVisible(params.open);
        },
        [METHODS.addOnsRefresh]: () => {
            addOns.refresh();
        },
        [METHODS.addOnsReview]: () => {
            addOns.revealNeedsReview();
        },
    };
}
