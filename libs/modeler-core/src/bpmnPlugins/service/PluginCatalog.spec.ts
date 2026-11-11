import { describe, expect, it, vi } from "vitest";

import { Allowance, allowanceOf, allowanceRowOf, LOCAL_HOST } from "../../kernel/domain/allowance";
import { CodeApproval } from "../../kernel/domain/codeApproval";
import { AllowanceLocator } from "../../kernel/service/AllowanceLocator";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { ContentRows } from "../../kernel/service/ContentRowMigration";
import {
    createTestHost,
    fingerprintHasher,
    InMemoryInstalledPackages,
    writeLinkedWorktree,
    writeRepository,
} from "../../testing";
import { PluginCatalog } from "./PluginCatalog";
import { WorkspacePluginLocator } from "./WorkspacePluginLocator";

const RESIZE = "/repo/.camunda/plugins/resize-tasks";
const PALETTE = "/repo/.camunda/plugins/reduced-palette";
const WORKTREE_RESIZE = "/worktree/.camunda/plugins/resize-tasks";
const DOCUMENT = "/repo/order.bpmn";
const WORKTREE_DOCUMENT = "/worktree/order.bpmn";

const RESIZE_ALLOWANCE = allowanceOf(
    "plugin",
    RESIZE,
    { kind: "repository", worktreeRoot: "/repo", commonDir: "/repo/.git" },
    LOCAL_HOST,
);

const contentRowAt = (pluginId: string): CodeApproval => ({
    pluginId,
    contentHash: "0".repeat(64),
});

const pluginFiles = (folder: string, name: string, script: string) => ({
    [`${folder}/plugin.json`]: JSON.stringify({ name, script: "client.js" }),
    [`${folder}/client.js`]: script,
});

/** Settles nothing, but counts every wait and runs `onWait` as a migration landing would. */
class CountedContentRows implements ContentRows {
    waits = 0;

    constructor(private readonly onWait: () => void = () => undefined) {}

    whenSettled(): Promise<void> {
        this.waits++;
        this.onWait();
        return Promise.resolve();
    }

    locate(): ReadonlyMap<string, Allowance> {
        return new Map<string, Allowance>();
    }
}

function setUp({ onWait }: { onWait?: (host: ReturnType<typeof createTestHost>) => void } = {}) {
    const host = createTestHost({
        folders: ["/repo", "/worktree"],
        files: {
            ...pluginFiles(RESIZE, "Resize Tasks", "registerResize();"),
            ...pluginFiles(PALETTE, "Reduced Palette", "registerPalette();"),
            ...pluginFiles(WORKTREE_RESIZE, "Resize Tasks", "registerResizE();"),
        },
    });
    const disk = new InMemoryInstalledPackages();
    writeRepository(disk, "/repo");
    writeLinkedWorktree(disk, "/repo", "/worktree");
    [RESIZE, PALETTE, WORKTREE_RESIZE].forEach((folder) => disk.createDirectory(folder));
    const locator = new WorkspacePluginLocator(
        new ArtifactService(host.workspace, host.settings, host.notifier),
        host.workspace,
        fingerprintHasher,
        new AllowanceLocator(disk, LOCAL_HOST),
        host.notifier,
    );
    const contentRows = new CountedContentRows(() => onWait?.(host));
    const catalog = new PluginCatalog(locator, host.pluginApprovals, contentRows, host.notifier);
    return { host, catalog, contentRows };
}

describe("PluginCatalog", () => {
    it("separates the plugins a document may load, with their bytes, from those to ask about", async () => {
        const { host, catalog } = setUp();
        host.pluginApprovals.approvals = [contentRowAt(PALETTE)];

        const { approved, pending } = await catalog.pluginsFor(DOCUMENT);

        expect(approved.map(({ plugin, script }) => ({ id: plugin.id, script }))).toEqual([
            { id: PALETTE, script: "registerPalette();" },
        ]);
        expect(pending.map(({ id, allowance }) => ({ id, allowance }))).toEqual([
            { id: RESIZE, allowance: RESIZE_ALLOWANCE },
        ]);
    });

    it("allows the checked plugin by its allowance and stops asking about the others", async () => {
        const { host, catalog } = setUp();
        const { pending } = await catalog.pluginsFor(DOCUMENT);

        const allowed = await catalog.applyAnswer(pending, { kind: "checked", ids: [RESIZE] });

        expect(allowed.map((plugin) => plugin.id)).toEqual([RESIZE]);
        expect(host.pluginApprovals.approvals).toEqual([allowanceRowOf(RESIZE_ALLOWANCE)]);
        const after = await catalog.pluginsFor(DOCUMENT);
        expect(after.approved.map(({ plugin }) => plugin.id)).toEqual([RESIZE]);
        expect(after.pending).toEqual([]);
        expect(catalog.stillPendingOf(pending)).toEqual([]);
    });

    it("serves a plugin in another worktree once the first allowed it, whatever its content there", async () => {
        const { host, catalog } = setUp();
        host.pluginApprovals.approvals = [allowanceRowOf(RESIZE_ALLOWANCE)];

        const { approved, pending } = await catalog.pluginsFor(WORKTREE_DOCUMENT);

        expect(approved.map(({ plugin, script }) => ({ id: plugin.id, script }))).toEqual([
            { id: WORKTREE_RESIZE, script: "registerResizE();" },
        ]);
        expect(pending).toEqual([]);
    });

    it("asks once about a plugin found in two worktrees, at the place found first", async () => {
        const { catalog } = setUp();
        const inRepository = (await catalog.pluginsFor(DOCUMENT)).pending;
        const inWorktree = (await catalog.pluginsFor(WORKTREE_DOCUMENT)).pending;

        expect(
            catalog.stillPendingOf([...inWorktree, ...inRepository]).map(({ id }) => id),
        ).toEqual([WORKTREE_RESIZE, PALETTE]);
    });

    it("stops asking about a plugin declined in one worktree in every other", async () => {
        const { catalog } = setUp();
        await catalog.applyAnswer((await catalog.pluginsFor(DOCUMENT)).pending, {
            kind: "checked",
            ids: [],
        });

        const { pending } = await catalog.pluginsFor(WORKTREE_DOCUMENT);

        expect(pending).toEqual([]);
        expect([...catalog.sessionAnswers().keys()]).toContain(
            JSON.stringify([
                "plugin",
                "",
                "repository",
                "/repo/.git",
                ".camunda/plugins/resize-tasks",
            ]),
        );
    });

    it("does not ask again about a declined plugin once its content changed", async () => {
        const { host, catalog } = setUp();
        await catalog.applyAnswer((await catalog.pluginsFor(DOCUMENT)).pending, {
            kind: "checked",
            ids: [],
        });

        await host.workspace.writeFile(`${RESIZE}/client.js`, "registerResizeAgain();");

        expect((await catalog.pluginsFor(DOCUMENT)).pending).toEqual([]);
    });

    it("lets a row pinned to content allow only the place it names", async () => {
        const { host, catalog } = setUp();
        host.pluginApprovals.approvals = [contentRowAt(RESIZE)];

        const inRepository = await catalog.pluginsFor(DOCUMENT);
        const inWorktree = await catalog.pluginsFor(WORKTREE_DOCUMENT);

        expect(inRepository.approved.map(({ plugin }) => plugin.id)).toEqual([RESIZE]);
        expect(inWorktree.pending.map(({ id }) => id)).toEqual([WORKTREE_RESIZE]);
    });

    it("waits for the migration only when it would ask, then decides again", async () => {
        const { catalog, contentRows } = setUp({
            onWait: (host) => {
                host.pluginApprovals.approvals = [allowanceRowOf(RESIZE_ALLOWANCE)];
            },
        });

        const { approved, pending } = await catalog.pluginsFor(WORKTREE_DOCUMENT);

        expect(contentRows.waits).toBe(1);
        expect(approved.map(({ plugin }) => plugin.id)).toEqual([WORKTREE_RESIZE]);
        expect(pending).toEqual([]);
    });

    it("does not wait for the migration while every plugin is allowed", async () => {
        const { host, catalog, contentRows } = setUp();
        host.pluginApprovals.approvals = [allowanceRowOf(RESIZE_ALLOWANCE)];

        await catalog.pluginsFor(WORKTREE_DOCUMENT);

        expect(contentRows.waits).toBe(0);
    });

    it("withholds every plugin it may not load, also those no notice asks about again", async () => {
        const { host, catalog } = setUp();
        host.pluginApprovals.approvals = [contentRowAt(PALETTE)];
        await catalog.applyAnswer((await catalog.pluginsFor(DOCUMENT)).pending, {
            kind: "checked",
            ids: [],
        });

        const { pending, withheld } = await catalog.pluginsFor(DOCUMENT);

        expect(pending).toEqual([]);
        expect(withheld.map(({ id }) => id)).toEqual([RESIZE]);
    });

    it("offers no plugins and logs why when the plugin folders cannot be read", async () => {
        const { host, catalog } = setUp();
        vi.spyOn(host.workspace, "readDirectory").mockRejectedValueOnce(new Error("EACCES"));

        const selection = await catalog.pluginsFor(DOCUMENT);

        expect(selection).toEqual({ approved: [], pending: [], withheld: [] });
        expect(host.notifier.loggedErrors.map((error) => error.message)).toEqual(["EACCES"]);
    });
});
