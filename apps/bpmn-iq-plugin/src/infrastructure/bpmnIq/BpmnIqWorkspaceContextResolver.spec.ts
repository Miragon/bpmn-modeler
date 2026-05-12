import { describe, expect, it, vi } from "vitest";

import type { GitInfo } from "../../domain/bpmnIq/gitDetect";
import type { BpmnIqWorkspaceMeta } from "./BpmnIqWorkspaceConfig";
import {
    BpmnIqWorkspaceContextResolver,
    type WorkspaceConfigPort,
    type WorkspacePrompts,
} from "./BpmnIqWorkspaceContextResolver";

const meta = (overrides: Partial<BpmnIqWorkspaceMeta> = {}): BpmnIqWorkspaceMeta => ({
    workspaceId: "ws-1",
    name: "demo",
    createdAt: "2026-01-01T00:00:00.000Z",
    repoId: "repo-a",
    branch: "main",
    ...overrides,
});

const git = (overrides: Partial<GitInfo> = {}): GitInfo => ({
    repoId: "repo-a",
    branch: "main",
    gitDir: "/tmp/.git",
    ...overrides,
});

const fakeConfig = (overrides: Partial<WorkspaceConfigPort> = {}): WorkspaceConfigPort => ({
    load: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    buildNew: vi.fn(({ name, workspaceId }) =>
        meta({ name, workspaceId: workspaceId ?? "generated" }),
    ),
    buildForGit: vi.fn(({ git: g, name }) =>
        meta({
            workspaceId: `derived-${g.repoId}-${g.branch}`,
            name: name ?? `${g.repoSlug ?? "repo"} · ${g.branch}`,
            repoId: g.repoId,
            branch: g.branch,
        }),
    ),
    ...overrides,
});

const cancelAllPrompts: WorkspacePrompts = {
    pickWorkspaceMode: vi.fn().mockResolvedValue(null),
    inputWorkspaceId: vi.fn().mockResolvedValue(null),
    inputWorkspaceName: vi.fn().mockResolvedValue(null),
};

describe("BpmnIqWorkspaceContextResolver", () => {
    it("returns existing meta unchanged when git matches (no drift)", async () => {
        const config = fakeConfig({
            load: vi.fn().mockResolvedValue(meta()),
        } as Partial<WorkspaceConfigPort>);
        const resolver = new BpmnIqWorkspaceContextResolver(
            config,
            cancelAllPrompts,
            async () => git(),
        );

        const ctx = await resolver.resolve("/repo", "demo");

        expect(ctx?.migrated).toBe(false);
        expect(ctx?.meta.workspaceId).toBe("ws-1");
        expect(config.save).not.toHaveBeenCalled();
    });

    it("rebuilds + saves when the existing meta drifts from the current branch", async () => {
        const config = fakeConfig({
            load: vi.fn().mockResolvedValue(meta({ branch: "old" })),
        } as Partial<WorkspaceConfigPort>);
        const resolver = new BpmnIqWorkspaceContextResolver(
            config,
            cancelAllPrompts,
            async () => git({ branch: "feature" }),
        );

        const ctx = await resolver.resolve("/repo", "demo");

        expect(ctx?.migrated).toBe(true);
        expect(ctx?.meta.branch).toBe("feature");
        expect(config.save).toHaveBeenCalledOnce();
    });

    it("derives + saves a fresh meta when no config exists but git does", async () => {
        const config = fakeConfig();
        const resolver = new BpmnIqWorkspaceContextResolver(
            config,
            cancelAllPrompts,
            async () => git({ branch: "feature" }),
        );

        const ctx = await resolver.resolve("/repo", "demo");

        expect(ctx?.meta.branch).toBe("feature");
        expect(ctx?.migrated).toBe(false);
        expect(config.save).toHaveBeenCalledOnce();
    });

    it("returns null when prompts are cancelled and there is no git or config", async () => {
        const config = fakeConfig();
        const resolver = new BpmnIqWorkspaceContextResolver(
            config,
            cancelAllPrompts,
            async () => null,
        );

        const ctx = await resolver.resolve("/some/folder", "folder");

        expect(ctx).toBeNull();
        expect(config.save).not.toHaveBeenCalled();
    });
});
