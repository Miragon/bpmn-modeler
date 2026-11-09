import { Memento } from "vscode";

import {
    approvalsAfter,
    approvalsKey,
    CodeApprovalChange,
    PluginApproval,
    PluginApprovalStorePort,
} from "@miragon/bpmn-modeler-core";

export const APPROVALS_KEY = "bpmnPluginApprovals";

/**
 * In VS Code's global state, which no workspace file and no workspace setting
 * can write, so a cloned repository cannot approve its own plugins.
 *
 * Another window's write reaches this one only through `readStored`, which the
 * composition calls when the window gains focus.
 */
export class VsCodePluginApprovalStore implements PluginApprovalStorePort {
    // Each change reads the list only after the one before it stored, whether
    // or not the memento's update sets its value before it resolves.
    private changes: Promise<void> = Promise.resolve();
    private readonly listeners = new Set<() => void>();
    private reportedKey: string;

    constructor(private readonly globalState: Memento) {
        this.reportedKey = approvalsKey(this.read());
    }

    read(): readonly PluginApproval[] {
        return this.globalState.get<PluginApproval[]>(APPROVALS_KEY, []);
    }

    change(change: CodeApprovalChange): Promise<void> {
        const changed = this.changes.then(async () => {
            const stored = this.read();
            const merged = approvalsAfter(stored, change);
            if (approvalsKey(merged) === approvalsKey(stored)) return;
            await this.globalState.update(APPROVALS_KEY, merged);
            this.report(merged);
        });
        this.changes = changed.catch(() => undefined);
        return changed;
    }

    async readStored(): Promise<readonly PluginApproval[]> {
        const stored = [...this.read()];
        this.report(stored);
        return stored;
    }

    onDidChange(listener: () => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    private report(approvals: readonly PluginApproval[]): void {
        const key = approvalsKey(approvals);
        if (key === this.reportedKey) return;
        this.reportedKey = key;
        this.listeners.forEach((listener) => listener());
    }
}
