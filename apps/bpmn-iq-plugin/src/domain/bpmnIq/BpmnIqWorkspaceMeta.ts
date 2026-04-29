/**
 * Shape of `<root>/.bpmn-iq/workspace.json` after parsing/migration.
 *
 * Mirrors the upstream `bpmn-iq` CLI agent so the same file is usable
 * interchangeably from CLI and from this extension.
 */
export interface BpmnIqWorkspaceMeta {
    workspaceId: string;
    name: string;
    repoId?: string;
    repoSlug?: string;
    branch?: string;
    createdAt: string;
}
