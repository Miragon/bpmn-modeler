import { CodeApproval } from "../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../kernel/port/approvalPorts";

export class InMemoryPluginApprovals implements PluginApprovalStorePort {
    approvals: readonly CodeApproval[] = [];

    read(): readonly CodeApproval[] {
        return this.approvals;
    }

    async write(approvals: readonly CodeApproval[]): Promise<void> {
        this.approvals = [...approvals];
    }
}
