import type { BpmnIqSyncSnapshot } from "./syncState";
import { buildWebUiUrl } from "./webUiUrl";

/**
 * Discriminator for actions surfaced via the status-bar quick-pick.
 *
 * Cloud-only build: no `switchToCloud` / `switchToLocal` / `openSettings`
 * entries — the daemon URL is baked at build time and there is nothing for
 * the user to toggle.
 */
export type MenuAction = "openWebUi" | "copyWebUiUrl" | "stop" | "retry";

/**
 * Pure data shape for a quick-pick item.  Mirrors the subset of VS Code's
 * `QuickPickItem` we use, but stays vscode-free so the helper can be
 * unit-tested without importing the editor runtime.
 */
export interface MenuItem {
    label: string;
    description?: string;
    /** When true, render as a separator instead of an action. */
    separator?: boolean;
    /** Action dispatched on selection.  Absent for separators. */
    action?: MenuAction;
}

/**
 * Placeholder text shown above the quick-pick list, summarising the current
 * state and target daemon.
 */
export function menuPlaceholder(snap: BpmnIqSyncSnapshot, daemonUrl: string): string {
    const daemonHost = daemonUrl.replace(/^https?:\/\//, "");
    switch (snap.status) {
        case "syncing":
            return `BPMN-IQ · syncing against ${daemonHost}`;
        case "connecting":
            return `BPMN-IQ · connecting to ${daemonHost}…`;
        case "error":
            return `BPMN-IQ · disconnected from ${daemonHost}`;
        default:
            return "BPMN-IQ actions";
    }
}

/**
 * Build the state-aware list of menu actions.  Pure function: same inputs,
 * same items.
 *
 * Cloud-only build: Web UI links + stop/retry are the only entries.  The
 * daemon URL is baked at build time, so there is no toggle or settings
 * link to surface here.
 */
export function buildMenuItems(snap: BpmnIqSyncSnapshot, daemonUrl: string): MenuItem[] {
    const items: MenuItem[] = [];

    if (snap.status === "syncing") {
        items.push({
            label: "$(link-external) Open in Web UI",
            description: buildWebUiUrl(daemonUrl, snap.workspaceId),
            action: "openWebUi",
        });
        if (snap.workspaceId) {
            items.push({
                label: "$(clippy) Copy Web UI link",
                description: buildWebUiUrl(daemonUrl, snap.workspaceId),
                action: "copyWebUiUrl",
            });
        }
    }

    if (snap.status === "error") {
        items.push({
            label: "$(refresh) Retry",
            description: snap.detail,
            action: "retry",
        });
    }

    items.push({ label: "", separator: true });

    items.push({
        label: snap.status === "error" ? "$(debug-stop) Stop trying" : "$(debug-stop) Stop sync",
        action: "stop",
    });

    return items;
}
