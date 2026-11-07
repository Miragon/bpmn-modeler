import { PluginApproval } from "@miragon/bpmn-modeler-core";

/** The bridge's copy of the approvals the host stores, replaced by every snapshot the host sends. */
export interface PluginApprovalsMirror {
    apply(approvals: readonly PluginApproval[]): void;
}
