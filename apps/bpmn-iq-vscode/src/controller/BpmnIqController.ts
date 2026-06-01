import { basename } from "path";

import { Disposable, ExtensionContext, Uri, commands, env, window, workspace } from "vscode";

import type { MenuAction } from "../domain/menuItems";
import { buildWebUiUrl } from "../domain/webUiUrl";
import type { BpmnIqBranchSwitchOrchestrator } from "../infrastructure/BpmnIqBranchSwitchOrchestrator";
import type { BpmnIqMenu } from "../infrastructure/BpmnIqMenu";
import type { BpmnIqStatusBar } from "../infrastructure/BpmnIqStatusBar";
import type { BpmnIqWorkspaceContextResolver } from "../infrastructure/BpmnIqWorkspaceContextResolver";
import type { VsCodeSettings } from "../infrastructure/VsCodeSettings";
import type { VsCodeUI } from "../infrastructure/VsCodeUI";
import type { BpmnIqSyncService } from "../service/BpmnIqSyncService";
import type { BpmnIqWorkspacePuller } from "../service/BpmnIqWorkspacePuller";

const CMD_TOGGLE = "miragon.bpmnIq.toggle";
const CMD_SHOW_MENU = "miragon.bpmnIq.showMenu";
const CMD_START = "miragon.bpmnIq.start";
const CMD_STOP = "miragon.bpmnIq.stop";
const CMD_PULL = "miragon.bpmnIq.pull";
const CMD_OPEN_WEB_UI = "miragon.bpmnIq.openWebUi";
const CMD_COPY_WEB_UI_URL = "miragon.bpmnIq.copyWebUiUrl";

export const BPMN_IQ_SHOW_MENU_COMMAND = CMD_SHOW_MENU;

/** User-facing message when the bundle was produced without a daemon URL. */
const MISSING_DAEMON_URL_MESSAGE =
    "BPMN-IQ: this build was not configured with a daemon URL. Contact Miragon for a properly configured build.";

/**
 * Thin command-wiring layer for the bpmn-iq feature.  Owns nothing:
 *
 *   - The status-bar UI lives in {@link BpmnIqStatusBar}.
 *   - The quick-pick menu lives in {@link BpmnIqMenu}.
 *   - The new/migrate/join workspace flow lives in
 *     {@link BpmnIqWorkspaceContextResolver}.
 *   - The branch-watcher lives in {@link BpmnIqBranchSwitchOrchestrator}.
 *
 * This class only registers the seven commands and orchestrates the
 * collaborators on `start`/`stop`/menu actions.  Cloud-only: there is no
 * daemon-URL toggle, so the controller does not expose any switching
 * commands.
 */
export class BpmnIqController implements Disposable {
    private readonly disposables: Disposable[] = [];

    constructor(
        private readonly service: BpmnIqSyncService,
        private readonly statusBar: BpmnIqStatusBar,
        private readonly menu: BpmnIqMenu,
        private readonly contextResolver: BpmnIqWorkspaceContextResolver,
        private readonly branchOrchestrator: BpmnIqBranchSwitchOrchestrator,
        private readonly puller: BpmnIqWorkspacePuller,
        private readonly vsSettings: VsCodeSettings,
        private readonly vsUI: VsCodeUI,
    ) {}

    register(context: ExtensionContext): void {
        this.disposables.push(
            commands.registerCommand(CMD_TOGGLE, () => this.toggle()),
            commands.registerCommand(CMD_SHOW_MENU, () => this.showStatusBarMenu()),
            commands.registerCommand(CMD_START, () => this.start()),
            commands.registerCommand(CMD_STOP, () => this.stop()),
            commands.registerCommand(CMD_PULL, () => this.pull()),
            commands.registerCommand(CMD_OPEN_WEB_UI, () => this.openWebUi()),
            commands.registerCommand(CMD_COPY_WEB_UI_URL, () => this.copyWebUiUrl()),
            this.service.onDidChangeState((snap) => this.statusBar.render(snap)),
        );

        // Initial paint with the current snapshot.
        this.statusBar.render(this.service.getSnapshot());

        context.subscriptions.push(this);
    }

    dispose(): void {
        this.branchOrchestrator.stop();
        this.disposables.forEach((d) => d.dispose());
        this.statusBar.dispose();
    }

    // ─── Lifecycle commands ─────────────────────────────────────────────────

    private async toggle(): Promise<void> {
        if (this.service.isRunning) await this.stop();
        else await this.start();
    }

    private async start(): Promise<void> {
        if (this.service.isRunning) return;
        const folder = workspace.workspaceFolders?.[0];
        if (!folder) {
            this.vsUI.showError("BPMN-IQ: open a folder first.");
            return;
        }

        const daemonUrl = this.vsSettings.getDaemonUrl();
        if (!daemonUrl) {
            this.vsUI.showError(MISSING_DAEMON_URL_MESSAGE);
            return;
        }

        const root = folder.uri.fsPath;
        const defaultName = this.defaultWorkspaceName(root);
        const ctx = await this.contextResolver.resolve(root, defaultName);
        if (!ctx) return;

        if (ctx.migrated) {
            this.vsUI.showInfo(`BPMN-IQ: migrated workspace to branch "${ctx.git!.branch}".`);
        }

        try {
            await this.service.start(
                {
                    folder,
                    meta: ctx.meta,
                    hydrateOnStart: this.vsSettings.getHydrateOnStart(),
                    gitInfo: ctx.git,
                },
                daemonUrl,
            );
            this.branchOrchestrator.start(root, ctx.git, daemonUrl);
            this.vsUI.showInfo(
                `BPMN-IQ: syncing workspace "${ctx.meta.name}" — click the status bar for actions.`,
            );
        } catch (err) {
            this.handleStartError(err, daemonUrl);
        }
    }

    private async stop(): Promise<void> {
        if (!this.service.isRunning) return;
        this.branchOrchestrator.stop();
        await this.service.stop();
        this.vsUI.showInfo("BPMN-IQ: sync stopped");
    }

    private handleStartError(err: unknown, daemonUrl: string): void {
        this.vsUI.logError(err as Error);
        const code = (err as { cause?: { code?: string } }).cause?.code;
        const isConnect = code === "ECONNREFUSED" || code === "ENOTFOUND" || code === "EAI_AGAIN";
        const message = isConnect
            ? `BPMN-IQ: cannot reach daemon at ${daemonUrl} — click the status bar for options.`
            : `BPMN-IQ start failed: ${(err as Error).message} — click the status bar for options.`;
        this.vsUI.showError(message);
    }

    // ─── Menu ──────────────────────────────────────────────────────────────

    private async showStatusBarMenu(): Promise<void> {
        const snap = this.service.getSnapshot();
        if (snap.status === "off") {
            await this.start();
            return;
        }
        const action = await this.menu.show(snap, this.vsSettings.getDaemonUrl());
        if (action) await this.dispatchMenuAction(action);
    }

    private async dispatchMenuAction(action: MenuAction): Promise<void> {
        switch (action) {
            case "openWebUi":
                return this.openWebUi();
            case "copyWebUiUrl":
                return this.copyWebUiUrl();
            case "retry":
                return this.start();
            case "stop":
                return this.stop();
            default: {
                const _exhaustive: never = action;
                throw new Error(`Unhandled menu action: ${String(_exhaustive)}`);
            }
        }
    }

    // ─── Other commands ────────────────────────────────────────────────────

    private async pull(): Promise<void> {
        const folder = workspace.workspaceFolders?.[0];
        if (!folder) {
            this.vsUI.showError("BPMN-IQ: open a folder first.");
            return;
        }
        if (this.service.isRunning) {
            this.vsUI.showError("BPMN-IQ is already running. Stop it first, then pull.");
            return;
        }
        const daemonUrl = this.vsSettings.getDaemonUrl();
        if (!daemonUrl) {
            this.vsUI.showError(MISSING_DAEMON_URL_MESSAGE);
            return;
        }
        const workspaceId = await window.showInputBox({
            prompt: "Workspace ID to join",
            placeHolder: "e.g. 8f3a2b14-…",
            ignoreFocusOut: true,
        });
        if (!workspaceId) return;

        try {
            const result = await this.puller.pull(folder, daemonUrl, workspaceId);
            if (result.skippedUnsafe > 0) {
                this.vsUI.logWarning(
                    `[bpmn-iq] skipped ${result.skippedUnsafe} model(s) with unsafe relPath`,
                );
            }
            this.vsUI.showInfo(
                `BPMN-IQ: pulled ${result.written} model(s) from "${result.workspaceName}"`,
            );
        } catch (err) {
            this.vsUI.showError(`BPMN-IQ pull failed: ${(err as Error).message}`);
        }
    }

    private async openWebUi(): Promise<void> {
        const url = buildWebUiUrl(
            this.vsSettings.getDaemonUrl(),
            this.service.getSnapshot().workspaceId,
        );
        await env.openExternal(Uri.parse(url));
    }

    private async copyWebUiUrl(): Promise<void> {
        const snap = this.service.getSnapshot();
        if (!snap.workspaceId) {
            this.vsUI.showError("BPMN-IQ is not running — no Web UI link to copy.");
            return;
        }
        const url = buildWebUiUrl(this.vsSettings.getDaemonUrl(), snap.workspaceId);
        await env.clipboard.writeText(url);
        this.vsUI.showInfo(`Copied Web UI link: ${url}`);
    }

    // ─── Helpers ───────────────────────────────────────────────────────────

    private defaultWorkspaceName(root: string): string {
        return this.vsSettings.getWorkspaceName() || basename(root) || "workspace";
    }
}
