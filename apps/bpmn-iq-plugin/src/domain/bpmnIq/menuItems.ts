import type { BpmnIqSyncSnapshot } from "./BpmnIqState";
import { buildWebUiUrl } from "./webUiUrl";

/** Default URL for a developer's local daemon (matches package.json default). */
export const LOCAL_DAEMON_URL = "http://localhost:4000";

/** Discriminator for actions surfaced via the status-bar quick-pick. */
export type MenuAction =
    | "openWebUi"
    | "copyWebUiUrl"
    | "switchToCloud"
    | "switchToLocal"
    | "openSettings"
    | "stop"
    | "retry";

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
 * Heuristic: a daemon URL counts as "local" when the host is loopback.
 * Used to decide whether the menu offers "Switch to Cloud" or
 * "Switch to Local".
 */
export function isLocalDaemonUrl(daemonUrl: string): boolean {
    return /localhost|127\.0\.0\.1|\[::1\]/.test(daemonUrl);
}

/**
 * Placeholder text shown above the quick-pick list, summarising the current
 * state and target daemon.
 */
export function menuPlaceholder(
    snap: BpmnIqSyncSnapshot,
    daemonUrl: string,
): string {
    const daemonHost = daemonUrl.replace(/^https?:\/\//, "");
    switch (snap.status) {
        case "syncing":
            return `bpmn-iq · syncing against ${daemonHost}`;
        case "connecting":
            return `bpmn-iq · connecting to ${daemonHost}…`;
        case "error":
            return `bpmn-iq · disconnected from ${daemonHost}`;
        default:
            return "bpmn-iq actions";
    }
}

/**
 * Build the state-aware list of menu actions.  Pure function: same inputs,
 * same items.
 *
 * Cloud/local switch entries are conditional on the current daemon URL so
 * the user never sees a no-op item.  The "Switch to Miragon Cloud" entry
 * is additionally gated on `cloudDaemonUrl` being non-empty — OSS builds
 * with no configured cloud URL hide the action entirely.
 */
export function buildMenuItems(
    snap: BpmnIqSyncSnapshot,
    daemonUrl: string,
    cloudDaemonUrl: string,
): MenuItem[] {
    const items: MenuItem[] = [];
    const isLocal = isLocalDaemonUrl(daemonUrl);

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

    if (isLocal && cloudDaemonUrl) {
        items.push({
            label: "$(cloud) Switch to Miragon Cloud",
            description: cloudDaemonUrl,
            action: "switchToCloud",
        });
    } else if (!isLocal) {
        items.push({
            label: "$(home) Switch to Local Daemon",
            description: LOCAL_DAEMON_URL,
            action: "switchToLocal",
        });
    }
    items.push({
        label: "$(gear) Open Settings…",
        description: "Edit the daemon URL manually",
        action: "openSettings",
    });
    items.push({ label: "", separator: true });

    items.push({
        label:
            snap.status === "error"
                ? "$(debug-stop) Stop trying"
                : "$(debug-stop) Stop sync",
        action: "stop",
    });

    return items;
}
