import type { BpmnIqWorkspaceMeta } from "./BpmnIqWorkspaceMeta";

/**
 * Persisted shape that may carry the legacy `wsId` field from older
 * agents/extensions (≤ daemon-client 0.3). Reads accept both the new
 * `workspaceId` field (≥ 0.4) and the legacy field; writes always emit
 * `workspaceId`.
 */
type StoredWorkspaceMeta = Partial<BpmnIqWorkspaceMeta> & { wsId?: string };

/**
 * Parse a `.bpmn-iq/workspace.json` payload into a normalized
 * {@link BpmnIqWorkspaceMeta}, or return `null` if the payload is invalid
 * (missing required fields, malformed JSON, etc.).
 *
 * Pure function — vscode-free, easy to unit-test. The on-disk migration
 * from `wsId` → `workspaceId` lives here.
 */
export function parseStoredMeta(json: string): BpmnIqWorkspaceMeta | null {
    let parsed: StoredWorkspaceMeta;
    try {
        parsed = JSON.parse(json) as StoredWorkspaceMeta;
    } catch {
        return null;
    }
    const workspaceId = parsed.workspaceId ?? parsed.wsId;
    if (!workspaceId || !parsed.name || !parsed.createdAt) return null;
    return {
        workspaceId,
        name: parsed.name,
        createdAt: parsed.createdAt,
        repoId: parsed.repoId,
        repoSlug: parsed.repoSlug,
        branch: parsed.branch,
    };
}
