import { Memento } from "vscode";

import { PluginApproval, PluginApprovalStorePort } from "@miragon/bpmn-modeler-core";

const APPROVALS_KEY = "bpmnPluginApprovals";

/**
 * In VS Code's global state, which no workspace file and no workspace setting
 * can write, so a cloned repository cannot approve its own plugins.
 */
export class VsCodePluginApprovalStore implements PluginApprovalStorePort {
    constructor(private readonly globalState: Memento) {}

    read(): readonly PluginApproval[] {
        return this.globalState.get<PluginApproval[]>(APPROVALS_KEY, []);
    }

    write(approvals: readonly PluginApproval[]): Promise<void> {
        return Promise.resolve(this.globalState.update(APPROVALS_KEY, approvals));
    }
}
