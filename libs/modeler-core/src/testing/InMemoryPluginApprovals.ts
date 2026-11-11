import {
    approvalsAfter,
    approvalsKey,
    CodeApproval,
    CodeApprovalChange,
} from "../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../kernel/port/approvalPorts";

export class InMemoryPluginApprovals implements PluginApprovalStorePort {
    approvals: readonly CodeApproval[] = [];
    /** Every change this store was given, in order, so a spec can tell one write from two. */
    readonly receivedChanges: CodeApprovalChange[] = [];

    private readonly listeners = new Set<() => void>();
    private reportedKey = approvalsKey([]);

    read(): readonly CodeApproval[] {
        return this.approvals;
    }

    async change(change: CodeApprovalChange): Promise<void> {
        this.receivedChanges.push(change);
        this.approvals = approvalsAfter(this.approvals, change);
        this.report();
    }

    async readStored(): Promise<readonly CodeApproval[]> {
        this.report();
        return [...this.approvals];
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    /** Another writer stores this list, as another window or project does; `notify` tells this store. */
    storeElsewhere(
        approvals: readonly CodeApproval[],
        { notify = false }: { readonly notify?: boolean } = {},
    ): void {
        this.approvals = [...approvals];
        if (notify) this.report();
    }

    private report(): void {
        const key = approvalsKey(this.approvals);
        if (key === this.reportedKey) return;
        this.reportedKey = key;
        this.listeners.forEach((listener) => listener());
    }
}
