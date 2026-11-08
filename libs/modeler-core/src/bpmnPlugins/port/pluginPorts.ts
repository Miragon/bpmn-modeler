import { PluginApproval } from "../domain/pluginApproval";

/**
 * The user's plugin approvals, kept by the host outside every workspace (VS
 * Code's global state, IntelliJ's application settings), so a cloned
 * repository cannot approve its own plugins.
 */
export interface PluginApprovalStorePort {
    read(): readonly PluginApproval[];
    write(approvals: readonly PluginApproval[]): Promise<void>;
}

export interface ContentHasherPort {
    /** Hex SHA-256 of the UTF-8 text. */
    sha256(text: string): string;
}
