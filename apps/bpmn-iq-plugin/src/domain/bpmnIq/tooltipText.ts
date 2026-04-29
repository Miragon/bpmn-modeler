import type { BpmnIqSyncSnapshot } from "./BpmnIqState";
import { buildWebUiUrl } from "./webUiUrl";

const MD_SPECIALS_RE = /[\\`*_{}[\]()#+\-.!|>]/g;

/**
 * Escape characters that have special meaning in Markdown.  Used for
 * user-controlled values (workspace name, branch) inside the status-bar
 * tooltip so they can never break the rendering.
 */
export function escapeMd(value: string): string {
    return value.replace(MD_SPECIALS_RE, "\\$&");
}

/**
 * Build the Markdown body for the status-bar tooltip when bpmn-iq is in the
 * `syncing` state.  Returns the raw markdown string; the caller wraps it in
 * VS Code's `MarkdownString`.
 *
 * Pure function — vscode-free, easy to unit-test.
 */
export function buildSyncTooltipMarkdown(
    snap: BpmnIqSyncSnapshot,
    daemonUrl: string,
): string {
    const lines: string[] = [];
    lines.push(`**Workspace**: ${escapeMd(snap.workspaceName ?? "(unknown)")}`);
    if (snap.branch) {
        lines.push(`**Branch**: ${escapeMd(snap.branch)}`);
    }
    if (snap.workspaceId) {
        lines.push(`**Workspace ID**: \`${snap.workspaceId}\``);
        lines.push(`**Web UI**: ${buildWebUiUrl(daemonUrl, snap.workspaceId)}`);
    }
    lines.push("_Click for actions._");
    return lines.join("\n\n");
}
