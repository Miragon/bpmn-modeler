/**
 * Pure (vscode-free) path + model-id helpers shared between the bpmn-iq
 * infrastructure adapter and the sync service.  Lives in `domain/` so the
 * unit tests can import them without pulling in the vscode runtime.
 */

export const WORKSPACE_MODEL_ID_PREFIX = "workspace:";

/**
 * Reject path traversals, absolute paths, and Windows-style separators.
 * Relative paths sent to / received from the daemon must be safely writable
 * under the workspace root on any platform.
 */
export function isSafeRelPath(rel: string): boolean {
    if (!rel || rel.startsWith("/") || rel.includes("\\")) return false;
    return rel.split("/").every((s) => s !== "" && s !== "." && s !== "..");
}

/** Encode `workspaceId` + POSIX `relPath` into the daemon's workspace model id. */
export function encodeWorkspaceModelId(
    workspaceId: string,
    relPath: string,
): string {
    return `${WORKSPACE_MODEL_ID_PREFIX}${workspaceId}:${encodeURIComponent(relPath)}`;
}

/**
 * Decode a workspace-scoped daemon model id
 * `workspace:<workspaceId>:<encoded relPath>` into its parts.  Returns `null`
 * if the id is malformed, not workspace-scoped, or carries a `%`-sequence
 * that isn't valid UTF-8.
 */
export function decodeWorkspaceModelId(
    id: string,
): { workspaceId: string; relPath: string } | null {
    if (!id.startsWith(WORKSPACE_MODEL_ID_PREFIX)) return null;
    const rest = id.slice(WORKSPACE_MODEL_ID_PREFIX.length);
    const sep = rest.indexOf(":");
    if (sep <= 0) return null;
    const workspaceId = rest.slice(0, sep);
    try {
        const relPath = decodeURIComponent(rest.slice(sep + 1));
        return { workspaceId, relPath };
    } catch {
        return null;
    }
}
