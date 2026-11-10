export type { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";

export interface ContentHasherPort {
    /** Hex SHA-256 of the UTF-8 text. */
    sha256(text: string): string;
}
