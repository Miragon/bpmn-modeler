import type { DeploymentSidebarCommand, HostApi } from "@miragon/bpmn-modeler-shared";

/**
 * Shape of the data persisted via `host.setState` / `host.getState`.
 */
export interface WebviewState {
    formData?: Record<string, string>;
    collapsedSections?: string[];
    activeTab?: string;
}

export type DeploymentHost = HostApi<WebviewState, DeploymentSidebarCommand>;
