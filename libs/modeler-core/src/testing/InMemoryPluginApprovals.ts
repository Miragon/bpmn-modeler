import { approvalsAfter, CodeApproval, CodeApprovalChange } from "../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../kernel/port/approvalPorts";

export class InMemoryPluginApprovals implements PluginApprovalStorePort {
    approvals: readonly CodeApproval[] = [];

    read(): readonly CodeApproval[] {
        return this.approvals;
    }

    async change(change: CodeApprovalChange): Promise<void> {
        this.approvals = approvalsAfter(this.approvals, change);
    }

    /** Another writer stores this list, as another window or project does. */
    storeElsewhere(approvals: readonly CodeApproval[]): void {
        this.approvals = [...approvals];
    }
}
