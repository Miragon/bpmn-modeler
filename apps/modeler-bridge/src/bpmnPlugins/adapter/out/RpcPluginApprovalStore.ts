import { PluginApproval, PluginApprovalStorePort } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { PluginApprovalsParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { PluginApprovalsMirror } from "../../port/PluginApprovalsMirror";

/**
 * IntelliJ's application-level approval store, mirrored for the core's
 * synchronous `read()`. The host seeds the mirror on `session/register` and
 * replaces it with every `pluginApprovals/didChange`, which it sends to every
 * running bridge of the IDE after any of them saved.
 *
 * The host is the writer of record: `write` awaits the acknowledged
 * `pluginApprovals/save` and sets the mirror only then, so a read never shows
 * a list the host did not store, and a refused save leaves it as it was.
 */
export class RpcPluginApprovalStore implements PluginApprovalStorePort, PluginApprovalsMirror {
    private approvals: readonly PluginApproval[] = [];

    constructor(private readonly rpc: Rpc) {}

    read(): readonly PluginApproval[] {
        return this.approvals;
    }

    async write(approvals: readonly PluginApproval[]): Promise<void> {
        const params: PluginApprovalsParams = { approvals: copyOf(approvals) };
        await this.rpc.request(METHODS.pluginApprovalsSave, params);
        this.approvals = params.approvals;
    }

    apply(approvals: readonly PluginApproval[]): void {
        this.approvals = copyOf(approvals);
    }
}

function copyOf(approvals: readonly PluginApproval[]): PluginApproval[] {
    return approvals.map(({ pluginId, contentHash }) => ({ pluginId, contentHash }));
}
