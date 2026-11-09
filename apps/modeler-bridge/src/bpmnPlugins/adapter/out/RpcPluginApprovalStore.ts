import { CodeApprovalChange, PluginApproval, PluginApprovalStorePort } from "@miragon/bpmn-modeler-core";

import { METHODS } from "../../../protocol/domain/descriptor";
import { PluginApprovalsChangeParams, PluginApprovalsParams } from "../../../protocol/domain/types";
import { Rpc } from "../../../transport/adapter/out/Rpc";
import { PluginApprovalsMirror } from "../../port/PluginApprovalsMirror";

/**
 * IntelliJ's application-level approval store, mirrored for the core's
 * synchronous `read()`. The host seeds the mirror on `session/register` and
 * replaces it with every `pluginApprovals/didChange`, which it sends to every
 * running bridge of the IDE after any of them changed the list.
 *
 * The host is the writer of record: `change` sends only the rows to allow and
 * the ids to revoke, the host merges them into the list it stores, and the
 * mirror takes the list the host answers with. A refused change leaves the
 * mirror as it was.
 */
export class RpcPluginApprovalStore implements PluginApprovalStorePort, PluginApprovalsMirror {
    private approvals: readonly PluginApproval[] = [];

    constructor(private readonly rpc: Rpc) {}

    read(): readonly PluginApproval[] {
        return this.approvals;
    }

    async change({ allow, revoke }: CodeApprovalChange): Promise<void> {
        const stored = (await this.rpc.request(METHODS.pluginApprovalsChange, {
            allow: copyOf(allow),
            revoke: [...revoke],
        } satisfies PluginApprovalsChangeParams)) as PluginApprovalsParams;
        this.apply(stored.approvals);
    }

    apply(approvals: readonly PluginApproval[]): void {
        this.approvals = copyOf(approvals);
    }
}

function copyOf(approvals: readonly PluginApproval[]): PluginApproval[] {
    return approvals.map(({ pluginId, contentHash }) => ({ pluginId, contentHash }));
}
