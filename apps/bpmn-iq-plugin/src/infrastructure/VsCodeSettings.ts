import { ConfigurationTarget, workspace } from "vscode";

const SECTION = "miragon.bpmnIq";

/** VS Code workspace configuration reader for the bpmn-iq plugin. */
export class VsCodeSettings {
    /** Base URL of the bpmn-iq daemon (default `http://localhost:4000`). */
    getDaemonUrl(): string {
        const raw = workspace
            .getConfiguration(SECTION)
            .get<string>("daemonUrl", "http://localhost:4000");
        return raw.replace(/\/$/, "");
    }

    /**
     * Persist the daemon URL into workspace-scoped settings.  Workspace
     * scope so cloud routing is per-project (private customer code never
     * silently gets pushed to a shared cloud daemon just because the user
     * once clicked "Switch to Cloud" on a sample repo).
     */
    async setDaemonUrl(url: string): Promise<void> {
        await workspace
            .getConfiguration(SECTION)
            .update("daemonUrl", url, ConfigurationTarget.Workspace);
    }

    /** Whether to hydrate local files from the daemon when starting the sync. */
    getHydrateOnStart(): boolean {
        return (
            workspace
                .getConfiguration(SECTION)
                .get<boolean>("hydrateOnStart") ?? true
        );
    }

    /** Workspace name sent to the daemon. Empty = use folder basename. */
    getWorkspaceName(): string {
        return workspace
            .getConfiguration(SECTION)
            .get<string>("workspaceName", "");
    }

    /**
     * URL of the Miragon Cloud bpmn-iq daemon, used by the status-bar
     * "Switch to Miragon Cloud" action.
     *
     * Resolution order:
     *   1. The `miragon.bpmnIq.cloudDaemonUrl` workspace setting (runtime
     *      override — lets enterprise customers point at a self-hosted
     *      daemon without rebuilding the extension).
     *   2. The `MIRAGON_CLOUD_DAEMON_URL` env-var baked in by webpack
     *      `DefinePlugin` from a gitignored `.env` (default for the
     *      Miragon-built marketplace VSIX).
     *   3. Empty — the cloud action is then hidden from the menu.
     *
     * Trailing slashes are stripped to match the rest of the daemon
     * URL handling.
     */
    getCloudDaemonUrl(): string {
        const setting = workspace
            .getConfiguration(SECTION)
            .get<string>("cloudDaemonUrl", "")
            .replace(/\/$/, "");
        if (setting) return setting;
        const baked = process.env.MIRAGON_CLOUD_DAEMON_URL ?? "";
        return baked.replace(/\/$/, "");
    }
}
