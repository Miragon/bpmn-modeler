import { METHODS } from "../../../protocol/domain/descriptor";
import { RpcHandlerTable } from "../../../protocol/domain/rpcHandler";
import { PluginApprovalsParams } from "../../../protocol/domain/types";
import { PluginApprovalsMirror } from "../../port/PluginApprovalsMirror";

/**
 * The approvals the host stores for the user, pushed after any bridge of the
 * IDE saved them.
 *
 * RPC (Host → Core): pluginApprovals/didChange.
 */
export function pluginApprovalHandlers(mirror: PluginApprovalsMirror): RpcHandlerTable {
    return {
        [METHODS.pluginApprovalsDidChange]: (params: PluginApprovalsParams) => {
            mirror.apply(params.approvals);
        },
    };
}
