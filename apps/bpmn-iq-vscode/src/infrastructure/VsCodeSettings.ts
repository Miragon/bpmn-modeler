import { workspace } from "vscode";

const SECTION = "miragon.bpmnIq";

/**
 * VS Code workspace configuration reader for the bundled Miragon BPMN-IQ.
 *
 * Cloud-only: the daemon URL is **not** a user-facing setting.  It is baked
 * into the bundle at build time from `MIRAGON_CLOUD_DAEMON_URL` via webpack
 * `DefinePlugin` (see `webpack.config.js`).  When unset, the controller
 * surfaces a clear error instead of falling back to localhost.
 */
export class VsCodeSettings {
    /**
     * Returns the cloud daemon URL baked into the bundle at build time.
     * Empty string means this build was produced without a daemon URL; the
     * controller turns that into a user-facing error and refuses to start.
     */
    getDaemonUrl(): string {
        const baked = (process.env.MIRAGON_CLOUD_DAEMON_URL ?? "").replace(/\/$/, "");
        return baked;
    }

    /** Whether to hydrate local files from the daemon when starting the sync. */
    getHydrateOnStart(): boolean {
        return workspace.getConfiguration(SECTION).get<boolean>("hydrateOnStart") ?? true;
    }

    /** Workspace name sent to the daemon. Empty = use folder basename. */
    getWorkspaceName(): string {
        return workspace.getConfiguration(SECTION).get<string>("workspaceName", "");
    }
}
