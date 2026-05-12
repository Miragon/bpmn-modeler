/**
 * Runtime status of the bpmn-iq sync subsystem, consumed by the status-bar
 * controller to render icon, label, and tooltip.
 */
export type BpmnIqSyncStatus = "off" | "connecting" | "syncing" | "error";

export interface BpmnIqSyncSnapshot {
    status: BpmnIqSyncStatus;
    workspaceId?: string;
    workspaceName?: string;
    modelCount?: number;
    /** Git branch the workspace is bound to, when running inside a git repo. */
    branch?: string;
    /** Human-readable message attached to the current state (e.g. last error). */
    detail?: string;
}
