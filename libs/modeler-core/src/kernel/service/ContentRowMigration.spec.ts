import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeLinkedWorktree, writeRepository } from "../../testing/gitLayout";
import { InMemoryInstalledPackages } from "../../testing/InMemoryInstalledPackages";
import { InMemoryPluginApprovals } from "../../testing/InMemoryPluginApprovals";
import { RecordingNotifier } from "../../testing/RecordingNotifier";
import { allowanceRowOf, LOCAL_HOST } from "../domain/allowance";
import { CodeApproval } from "../domain/codeApproval";
import { CONTENT_ROW_MIGRATION_WAIT_MS } from "../domain/contentRowMigration";
import { AllowanceLocator } from "./AllowanceLocator";
import { ContentRowMigration } from "./ContentRowMigration";

const PLUGIN = ".camunda/plugins/trace";
const MAIN_PLUGIN = `/work/repo/${PLUGIN}`;
const TASK_PLUGIN = `/work/task/${PLUGIN}`;
const GONE_PLUGIN = `/gone/${PLUGIN}`;
const PLUGIN_HASH = "0123456789abcdef".repeat(4);
const NEVER = () => new Promise<void>(() => undefined);

const contentRow = (pluginId: string): CodeApproval => ({ pluginId, contentHash: PLUGIN_HASH });

/** A mirror that has not heard of the host's list yet. */
class LaggingMirror extends InMemoryPluginApprovals {
    override read(): readonly CodeApproval[] {
        return [];
    }
}

function settledFlag(promise: Promise<void>): { readonly settled: boolean } {
    const flag = { settled: false };
    void promise.then(() => (flag.settled = true));
    return flag;
}

const flushed = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("ContentRowMigration", () => {
    let files: InMemoryInstalledPackages;
    let store: InMemoryPluginApprovals;
    let notifier: RecordingNotifier;
    let allowances: AllowanceLocator;

    beforeEach(() => {
        files = new InMemoryInstalledPackages(() => "unused");
        writeRepository(files, "/work/repo");
        writeLinkedWorktree(files, "/work/repo", "/work/task");
        files.createDirectory(MAIN_PLUGIN);
        files.createDirectory(TASK_PLUGIN);
        store = new InMemoryPluginApprovals();
        notifier = new RecordingNotifier();
        allowances = new AllowanceLocator(files, LOCAL_HOST);
    });

    const migrationOver = (approvals = store, wait = NEVER) =>
        new ContentRowMigration(approvals, allowances, notifier, wait);

    it("rewrites every located content row in one change and logs it", async () => {
        store.storeElsewhere([contentRow(MAIN_PLUGIN), contentRow(TASK_PLUGIN)]);

        await migrationOver().run();

        const allowance = allowanceRowOf(allowances.allowanceAt("plugin", MAIN_PLUGIN));
        expect(store.receivedChanges).toEqual([
            { allow: [allowance], revoke: [MAIN_PLUGIN, TASK_PLUGIN] },
        ]);
        expect(store.approvals).toEqual([allowance]);
        expect(notifier.logged("info")).toEqual([
            "Approvals: rewrote 2 approvals pinned to content as allowances of their add-ons, later changes included.",
        ]);
    });

    it("keeps a content row whose place it cannot find here", async () => {
        store.storeElsewhere([contentRow(MAIN_PLUGIN), contentRow(GONE_PLUGIN)]);

        await migrationOver().run();

        expect(store.approvals).toContainEqual(contentRow(GONE_PLUGIN));
        expect(store.receivedChanges[0].revoke).toEqual([MAIN_PLUGIN]);
    });

    it("writes nothing when it locates no content row", async () => {
        store.storeElsewhere([contentRow(GONE_PLUGIN)]);

        await migrationOver().run();

        expect(store.receivedChanges).toEqual([]);
        expect(notifier.logs).toEqual([]);
    });

    it("writes nothing on a later start once the rows are rewritten", async () => {
        store.storeElsewhere([contentRow(MAIN_PLUGIN)]);
        await migrationOver().run();

        await migrationOver().run();

        expect(store.receivedChanges).toHaveLength(1);
    });

    it("decides on the host's stored list, not on a lagging mirror", async () => {
        const mirror = new LaggingMirror();
        mirror.storeElsewhere([contentRow(MAIN_PLUGIN)]);

        await migrationOver(mirror).run();

        expect(mirror.receivedChanges.flatMap(({ revoke }) => revoke)).toEqual([MAIN_PLUGIN]);
    });

    it("logs a change the host rejects and settles anyway", async () => {
        store.storeElsewhere([contentRow(MAIN_PLUGIN)]);
        vi.spyOn(store, "change").mockRejectedValue(new Error("host gone"));

        await expect(migrationOver().run()).resolves.toBeUndefined();

        expect(notifier.logged("error")).toEqual([
            expect.stringContaining("could not rewrite approvals pinned to content: host gone"),
        ]);
    });

    it("lets a waiter go on at once when no run started", async () => {
        const wait = vi.fn(NEVER);

        await migrationOver(store, wait).whenSettled();

        expect(wait).not.toHaveBeenCalled();
    });

    it("runs once however often it is started", async () => {
        store.storeElsewhere([contentRow(MAIN_PLUGIN)]);
        const migration = migrationOver();

        const first = migration.run();
        const second = migration.run();
        await first;

        expect(second).toBe(first);
        expect(store.receivedChanges).toHaveLength(1);
    });

    it("writes nothing on a remote host, where a content row may come from another machine", async () => {
        store.storeElsewhere([contentRow(MAIN_PLUGIN)]);
        allowances = new AllowanceLocator(files, "ssh-remote+box");

        await migrationOver().run();

        expect(store.receivedChanges).toEqual([]);
    });

    it("lets a waiter go on once the run settled, before the cap", async () => {
        store.storeElsewhere([contentRow(MAIN_PLUGIN)]);
        const migration = migrationOver();
        void migration.run();

        await migration.whenSettled();

        expect(store.receivedChanges).toHaveLength(1);
    });

    it("lets a waiter go on at the cap while the host never answers", async () => {
        store.storeElsewhere([contentRow(MAIN_PLUGIN)]);
        vi.spyOn(store, "change").mockImplementation(NEVER);
        let passCap = () => undefined as void;
        const wait = vi.fn(() => new Promise<void>((resolve) => (passCap = resolve)));
        const migration = migrationOver(store, wait);
        void migration.run();

        const waiter = settledFlag(migration.whenSettled());
        await flushed();
        expect(waiter.settled).toBe(false);

        passCap();
        await flushed();
        expect(waiter.settled).toBe(true);
        expect(wait).toHaveBeenCalledWith(CONTENT_ROW_MIGRATION_WAIT_MS);
    });

    it("locates each content row as the allowance of the add-on there now", () => {
        const located = migrationOver().locate([
            contentRow(TASK_PLUGIN),
            contentRow(GONE_PLUGIN),
            { pluginId: MAIN_PLUGIN, contentHash: "bpmnlint-closure-v1:abc" },
        ]);

        expect([...located]).toEqual([
            [TASK_PLUGIN, allowances.allowanceAt("plugin", MAIN_PLUGIN)],
            [MAIN_PLUGIN, allowances.allowanceAt("rulePackage", MAIN_PLUGIN)],
        ]);
    });
});
