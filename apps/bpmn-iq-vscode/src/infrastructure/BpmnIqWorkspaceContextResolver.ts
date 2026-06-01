import type { GitInfo } from "@miragon/bpmn-iq-daemon-client/identity";
import type { WorkspaceConfig } from "@miragon/bpmn-iq-daemon-client";

/**
 * The subset of {@link BpmnIqWorkspaceConfig} the resolver actually uses.
 * Narrowing the dependency lets specs implement a minimal fake without
 * `as unknown as` casts and prevents the resolver from accidentally
 * growing new responsibilities through the wider class.
 */
export interface WorkspaceConfigPort {
    load(root: string): Promise<WorkspaceConfig | null>;
    save(root: string, meta: WorkspaceConfig): Promise<void>;
    buildNew(opts: { name: string; workspaceId?: string }): WorkspaceConfig;
    buildForGit(opts: { root: string; git: GitInfo; name?: string }): WorkspaceConfig;
}

export interface ResolvedWorkspaceContext {
    meta: WorkspaceConfig;
    git: GitInfo | null;
    /** True when the existing meta drifted from git and was replaced. */
    migrated: boolean;
}

/**
 * Tiny port for the user-facing prompts the resolver needs.  Allows tests
 * to inject deterministic answers without mocking the entire vscode
 * `window` namespace.
 */
export interface WorkspacePrompts {
    /** Quick-pick: "Create new" vs. "Join existing". Returns null on dismiss. */
    pickWorkspaceMode(): Promise<"new" | "join" | null>;
    /** Input box for the existing workspace id. Returns null on dismiss. */
    inputWorkspaceId(): Promise<string | null>;
    /** Input box for the workspace name. Returns null on dismiss. */
    inputWorkspaceName(defaultName: string): Promise<string | null>;
}

/**
 * Port for detecting the surrounding git repo's identity.  The default
 * implementation is {@link infrastructure/GitDetector} (which shells out
 * to `git`); tests inject a deterministic stub.
 */
export interface GitDetectorPort {
    detect(root: string): Promise<GitInfo | null>;
}

/**
 * Resolve the meta + git context to start a session with.
 *
 * Decision tree:
 * 1. `gitDetector.detect(root)` → git or null
 * 2. existing = config.load(root)
 * 3. existing && git && drift → migrate via buildForGit + save (`migrated: true`)
 * 4. existing && (no git or no drift) → return existing
 * 5. !existing && git → buildForGit + save
 * 6. !existing && !git → fall back to the prompt flow
 *
 * Single responsibility: own this decision tree.  No status-bar, no
 * service interaction, no branch watching.
 */
export class BpmnIqWorkspaceContextResolver {
    constructor(
        private readonly workspaceConfig: WorkspaceConfigPort,
        private readonly prompts: WorkspacePrompts,
        private readonly gitDetector: GitDetectorPort,
    ) {}

    async resolve(root: string, defaultName: string): Promise<ResolvedWorkspaceContext | null> {
        const git = await this.gitDetector.detect(root);
        const existing = await this.workspaceConfig.load(root);

        if (existing && git) {
            const drift = existing.repoId !== git.repoId || existing.branch !== git.branch;
            if (drift) {
                const next = this.workspaceConfig.buildForGit({ root, git });
                await this.workspaceConfig.save(root, next);
                return { meta: next, git, migrated: true };
            }
            return { meta: existing, git, migrated: false };
        }

        if (existing) {
            return { meta: existing, git: null, migrated: false };
        }

        if (git) {
            const next = this.workspaceConfig.buildForGit({ root, git });
            await this.workspaceConfig.save(root, next);
            return { meta: next, git, migrated: false };
        }

        const meta = await this.promptForLegacyMeta(root, defaultName);
        if (!meta) return null;
        return { meta, git: null, migrated: false };
    }

    private async promptForLegacyMeta(
        root: string,
        defaultName: string,
    ): Promise<WorkspaceConfig | null> {
        const mode = await this.prompts.pickWorkspaceMode();
        if (!mode) return null;

        if (mode === "join") {
            const workspaceId = await this.prompts.inputWorkspaceId();
            if (!workspaceId) return null;
            const meta = this.workspaceConfig.buildNew({
                name: defaultName,
                workspaceId,
            });
            await this.workspaceConfig.save(root, meta);
            return meta;
        }

        const name = await this.prompts.inputWorkspaceName(defaultName);
        if (name === null) return null;
        const meta = this.workspaceConfig.buildNew({ name: name || defaultName });
        await this.workspaceConfig.save(root, meta);
        return meta;
    }
}
