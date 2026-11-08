import { CodeApproval } from "../domain/codeApproval";

/**
 * The user's code approvals, every kind in one list, kept by the host outside
 * every workspace (VS Code's global state, IntelliJ's application settings),
 * so a cloned repository cannot approve its own code.
 */
export interface PluginApprovalStorePort {
    read(): readonly CodeApproval[];
    write(approvals: readonly CodeApproval[]): Promise<void>;
}
