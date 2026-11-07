import { PluginApproval } from "../bpmnPlugins/domain/pluginApproval";
import { PluginApprovalStorePort } from "../bpmnPlugins/port/pluginPorts";

export class InMemoryPluginApprovals implements PluginApprovalStorePort {
    approvals: readonly PluginApproval[] = [];

    read(): readonly PluginApproval[] {
        return this.approvals;
    }

    async write(approvals: readonly PluginApproval[]): Promise<void> {
        this.approvals = [...approvals];
    }
}
