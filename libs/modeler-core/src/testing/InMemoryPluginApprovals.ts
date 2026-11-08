import { PluginApproval } from "../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../kernel/port/approvalPorts";

export class InMemoryPluginApprovals implements PluginApprovalStorePort {
    approvals: readonly PluginApproval[] = [];

    read(): readonly PluginApproval[] {
        return this.approvals;
    }

    async write(approvals: readonly PluginApproval[]): Promise<void> {
        this.approvals = [...approvals];
    }
}
