import { workspace } from "vscode";

import type { GitInfo } from "../../domain/bpmnIq/gitDetect";
import type { VsCodeSettings } from "../VsCodeSettings";
import type { VsCodeUI } from "../VsCodeUI";
import type { BpmnIqSyncService } from "../../service/BpmnIqSyncService";
import {
    createBranchWatcher,
    type BpmnIqBranchWatcher,
} from "./BpmnIqBranchWatcher";
import type { BpmnIqWorkspaceConfig } from "./BpmnIqWorkspaceConfig";

/**
 * Owns the branch-watcher + the serialisation that prevents two
 * concurrent branch switches from racing.
 *
 * Mirrors the upstream `bpmn-iq` agent's `cli.ts` queue: when a checkout
 * lands while another switch is in flight, only the *latest* target is
 * remembered, so rapid `A → B → C` checkouts collapse into a single final
 * re-registration on `C`.
 */
export class BpmnIqBranchSwitchOrchestrator {
    private watcher: BpmnIqBranchWatcher | null = null;

    private activeGitInfo: GitInfo | null = null;

    private activeRoot: string | null = null;

    private switchInProgress = false;

    private pendingTargetBranch: string | null = null;

    constructor(
        private readonly service: BpmnIqSyncService,
        private readonly workspaceConfig: BpmnIqWorkspaceConfig,
        private readonly vsSettings: VsCodeSettings,
        private readonly vsUI: VsCodeUI,
    ) {}

    /**
     * Begin watching the workspace's git HEAD.  Re-registers automatically
     * when the surrounding branch changes.  No-op when `git` is null
     * (workspace is not in a git repo).
     */
    start(root: string, git: GitInfo | null, daemonUrl: string): void {
        this.stop();
        if (!git) return;
        this.activeGitInfo = git;
        this.activeRoot = root;
        this.watcher = createBranchWatcher({
            gitDir: git.gitDir,
            initialBranch: git.branch,
            onBranchChanged: (next) => {
                void this.handleBranchChanged(next, daemonUrl);
            },
            onError: (err) => this.vsUI.logError(err as Error),
        });
    }

    stop(): void {
        this.watcher?.stop();
        this.watcher = null;
        this.activeGitInfo = null;
        this.activeRoot = null;
        this.switchInProgress = false;
        this.pendingTargetBranch = null;
    }

    /**
     * Handle a `<gitDir>/HEAD` change.  Mirrors the agent's `cli.ts`
     * serialisation: a switch in flight queues only the latest target,
     * so rapid `A → B → C` checkouts collapse to the final branch.
     */
    private async handleBranchChanged(
        detectedBranch: string | null,
        daemonUrl: string,
    ): Promise<void> {
        if (!this.activeGitInfo || !this.activeRoot) return;

        // Detached HEAD: keep the last branch's workspace.
        if (!detectedBranch) {
            this.vsUI.logInfo(
                `[bpmn-iq] detached HEAD, keeping workspace ${this.activeGitInfo.branch}`,
            );
            return;
        }
        if (detectedBranch === this.activeGitInfo.branch) return;

        if (this.switchInProgress) {
            this.pendingTargetBranch = detectedBranch;
            return;
        }
        this.switchInProgress = true;
        try {
            let nextBranch: string | null = detectedBranch;
            while (nextBranch) {
                await this.switchToBranch(nextBranch, daemonUrl);
                nextBranch =
                    this.pendingTargetBranch &&
                    this.activeGitInfo &&
                    this.pendingTargetBranch !== this.activeGitInfo.branch
                        ? this.pendingTargetBranch
                        : null;
                this.pendingTargetBranch = null;
            }
        } finally {
            this.switchInProgress = false;
        }
    }

    private async switchToBranch(
        targetBranch: string,
        daemonUrl: string,
    ): Promise<void> {
        const root = this.activeRoot;
        const prev = this.activeGitInfo;
        if (!root || !prev) return;

        this.vsUI.logInfo(
            `[bpmn-iq] branch changed: ${prev.branch} -> ${targetBranch}`,
        );

        const folder = workspace.workspaceFolders?.find(
            (f) => f.uri.fsPath === root,
        );
        if (!folder) {
            this.vsUI.logWarning(
                `[bpmn-iq] branch switch aborted: workspace folder for ${root} no longer open`,
            );
            return;
        }

        try {
            await this.service.stop();
            const nextGit: GitInfo = { ...prev, branch: targetBranch };
            const nextMeta = this.workspaceConfig.buildForGit({
                root,
                git: nextGit,
            });
            await this.workspaceConfig.save(root, nextMeta);
            this.activeGitInfo = nextGit;
            await this.service.start(
                {
                    folder,
                    meta: nextMeta,
                    hydrateOnStart: this.vsSettings.getHydrateOnStart(),
                    gitInfo: nextGit,
                },
                daemonUrl,
            );
            this.vsUI.showInfo(`bpmn-iq: switched to branch "${targetBranch}"`);
        } catch (err) {
            this.vsUI.logError(err as Error);
            this.vsUI.showError(
                `bpmn-iq: branch switch to "${targetBranch}" failed — ${(err as Error).message}`,
            );
        }
    }
}
