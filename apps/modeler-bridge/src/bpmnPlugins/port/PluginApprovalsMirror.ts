import { PluginApprovalsSnapshot } from "../../protocol/domain/types";

/** The bridge's copy of the approvals the host stores; keeps the newest snapshot the host sent. */
export interface PluginApprovalsMirror {
    apply(snapshot: PluginApprovalsSnapshot): void;
}
