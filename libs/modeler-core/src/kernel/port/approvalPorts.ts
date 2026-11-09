import { CodeApproval, CodeApprovalChange } from "../domain/codeApproval";

/**
 * The user's code approvals, every kind in one list, kept by the host outside
 * every workspace (VS Code's global state, IntelliJ's application settings),
 * so a cloned repository cannot approve its own code.
 */
export interface PluginApprovalStorePort {
    /** Synchronous; an IntelliJ mirror may lag the host by one push. */
    read(): readonly CodeApproval[];
    /**
     * The host merges the change into the list it stores, with
     * `approvalsAfter`, in one step, so a row another writer stored stays.
     * Rejects a change that names an id twice and stores nothing then.
     * Resolves once `read()` includes the change.
     */
    change(change: CodeApprovalChange): Promise<void>;
    /**
     * The host's stored list, asked for now rather than taken from a mirror, or
     * a newer one the store heard of meanwhile; `read()` returns it from then on.
     */
    readStored(): Promise<readonly CodeApproval[]>;
    /** After `read()` changed, whoever changed it; never for a list of the same rows. */
    onDidChange(listener: () => void): { dispose(): void };
}
