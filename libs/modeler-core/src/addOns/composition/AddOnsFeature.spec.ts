import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { GetBpmnPluginsCommand } from "@miragon/bpmn-modeler-shared";

import { BpmnPluginsFeature } from "../../bpmnPlugins/composition/BpmnPluginsFeature";
import {
    approvedContent,
    PLUGIN_APPROVAL_NOTICE_ID,
} from "../../bpmnPlugins/domain/pluginApproval";
import { settingChangeNaming, SettingChange } from "../../editorSession/domain/EditorSession";
import { ProcessRestart } from "../../kernel/domain/codeApproval";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { ApprovalQuestion } from "../../kernel/service/ApprovalQuestion";
import { QuestionQueue } from "../../kernel/service/QuestionQueue";
import { BlockedRulePackage } from "../../modeler/bpmn/domain/rulePackageApproval";
import { PackageClosureFingerprinter } from "../../modeler/bpmn/service/PackageClosureFingerprinter";
import { RulePackageCatalog } from "../../modeler/bpmn/service/RulePackageCatalog";
import { RulePackageInventory } from "../../modeler/bpmn/service/RulePackageInventory";
import { ContentHasherPort } from "../../bpmnPlugins/port/pluginPorts";
import { createTestHost, InMemoryInstalledPackages, RecordingAddOnView } from "../../testing";
import { AddOnsFeature } from "./AddOnsFeature";

const WORK = "/work";
const PLUGINS = `${WORK}/.camunda/plugins`;
const RESIZE = `${PLUGINS}/resize-tasks`;
const ACME = `${WORK}/node_modules/bpmnlint-plugin-acme`;
const CACHE = "/storage/bpmn-plugins";

const RESIZE_FILES = {
    [`${RESIZE}/plugin.json`]: '{ "name": "Resize Tasks", "script": "client.js" }',
    [`${RESIZE}/client.js`]: "registerResize();",
};
/** Real SHA-256, so a copy's folder is named as the prune expects. */
const sha256Hasher: ContentHasherPort = {
    sha256: (text) => createHash("sha256").update(text).digest("hex"),
};
const RESIZE_HASH = sha256Hasher.sha256(approvedContent("registerResize();", undefined));

/** Lets a spec fire the setting changes a host reports. */
class ScriptedSettingChanges {
    private readonly listeners = new Set<(change: SettingChange) => void>();

    onDidChange(listener: (change: SettingChange) => void): { dispose(): void } {
        this.listeners.add(listener);
        return { dispose: () => this.listeners.delete(listener) };
    }

    fire(change: SettingChange): void {
        this.listeners.forEach((listener) => listener(change));
    }
}

function setUp({
    files = RESIZE_FILES,
    folders = [WORK],
    restart = "reloadWindow",
}: { files?: Record<string, string>; folders?: string[]; restart?: ProcessRestart } = {}) {
    const host = createTestHost({ folders, files });
    const artifacts = new ArtifactService(host.workspace, host.settings, host.notifier);
    const plugins = new BpmnPluginsFeature({
        ...host,
        artifacts,
        approvals: host.pluginApprovals,
        cacheRoot: CACHE,
        hasher: sha256Hasher,
        questions: new QuestionQueue(),
    });
    const disk = new InMemoryInstalledPackages((bytes) =>
        createHash("sha256").update(bytes).digest("hex"),
    );
    const install = (dir: string, name: string, files: Record<string, string> = {}) => {
        disk.writeFile(`${dir}/package.json`, JSON.stringify({ name, version: "1.2.0" }));
        disk.writeFile(`${dir}/index.js`, `module.exports = "${name}";`);
        Object.entries(files).forEach(([relPath, text]) =>
            disk.writeFile(`${dir}/${relPath}`, text),
        );
    };
    const fingerprinter = new PackageClosureFingerprinter(disk);
    const rulePackageCatalog = new RulePackageCatalog(
        host.pluginApprovals,
        fingerprinter,
        host.notifier,
    );
    const settingChanges = new ScriptedSettingChanges();
    const addOns = new AddOnsFeature({
        workspace: host.workspace,
        settings: host.settings,
        notifier: host.notifier,
        approvals: host.pluginApprovals,
        settingChanges,
        restart,
        plugins: plugins.inventory,
        rulePackages: new RulePackageInventory(rulePackageCatalog, fingerprinter, disk),
    });
    const view = new RecordingAddOnView();
    const rulePackageHashOf = (id: string, kind: BlockedRulePackage["kind"] = "package") => {
        const fingerprint = fingerprinter.fingerprint({ id, kind });
        if (fingerprint.kind !== "fingerprinted") throw new Error(fingerprint.reason);
        return fingerprint.rulePackage.contentHash;
    };
    return {
        host,
        plugins,
        disk,
        install,
        rulePackageCatalog,
        settingChanges,
        addOns,
        view,
        rulePackageHashOf,
    };
}

async function shown(addOns: AddOnsFeature): Promise<void> {
    await addOns.whenSettled();
}

describe("AddOnsFeature", () => {
    describe("listing", () => {
        it("lists a workspace plugin and a node_modules rule package before any editor opened", async () => {
            const { install, addOns, view } = setUp();
            install(ACME, "bpmnlint-plugin-acme");

            view.attachTo(addOns);
            await shown(addOns);

            expect(
                view.addOns().map(({ id, name, state, actions }) => ({
                    id,
                    name,
                    state,
                    actions: actions.map(({ kind }) => kind),
                })),
            ).toEqual([
                { id: `plugin:${RESIZE}`, name: "Resize Tasks", state: "new", actions: ["allow"] },
                {
                    id: `rulePackage:${ACME}`,
                    name: "bpmnlint-plugin-acme",
                    state: "new",
                    actions: ["inspect"],
                },
            ]);
        });

        it("shows a new rule package as not allowed yet without hashing it", async () => {
            const { disk, install, addOns, view } = setUp({ files: {} });
            install(ACME, "bpmnlint-plugin-acme");

            view.attachTo(addOns);
            await shown(addOns);

            expect(view.addOnNamed("bpmnlint-plugin-acme").state).toBe("new");
            expect(disk.filesHashed).toEqual([]);
        });

        it("lists a stored row whose folder is gone, and none outside the workspace folders", async () => {
            const { host, addOns, view } = setUp({ files: {} });
            host.pluginApprovals.approvals = [
                { pluginId: `${PLUGINS}/removed`, contentHash: "a".repeat(64) },
                { pluginId: "/elsewhere/.camunda/plugins/x", contentHash: "b".repeat(64) },
            ];

            view.attachTo(addOns);
            await shown(addOns);

            expect(view.addOns().map(({ name, state }) => [name, state])).toEqual([
                ["removed", "gone"],
            ]);
        });

        it("lists the plugins of a nested config folder an editor looked in", async () => {
            const nested = "/work/orders/.camunda/plugins/order-tools";
            const { host, plugins, addOns, view } = setUp({
                files: {
                    [`${nested}/plugin.json`]: '{ "name": "Order Tools", "script": "client.js" }',
                    [`${nested}/client.js`]: "registerOrderTools();",
                },
            });
            const editor = await host.openSession("/work/orders/order.bpmn", [
                plugins.editorContribution.participant,
            ]);
            await plugins.editorContribution.commandHandlers.GetBpmnPluginsCommand(
                new GetBpmnPluginsCommand(),
                editor.id,
            );

            view.attachTo(addOns);
            await shown(addOns);

            expect(view.latest().groups[0].sources.map(({ label }) => label)).toEqual([
                "orders/.camunda",
            ]);
        });
    });

    describe("listing what a lint found", () => {
        const ORDERS = "/work/orders";

        it("lists a rule package installed only below a lint config's folder", async () => {
            const { install, rulePackageCatalog, addOns, view } = setUp({ files: {} });
            install(`${ORDERS}/node_modules/bpmnlint-plugin-orders`, "bpmnlint-plugin-orders");
            rulePackageCatalog.noteLintConfig(`${ORDERS}/.bpmnlintrc`);

            view.attachTo(addOns);
            await shown(addOns);

            expect(view.addOns().map(({ name }) => name)).toEqual(["bpmnlint-plugin-orders"]);
        });

        it("lists a config's own package the gate reported", async () => {
            const { install, rulePackageCatalog, addOns, view } = setUp({ files: {} });
            install(ORDERS, "bpmnlint-plugin-orders", { "order.bpmn": "<definitions/>" });
            rulePackageCatalog.noteSeen([
                { id: ORDERS, kind: "selfPackage", state: "new", needed: true },
            ]);

            view.attachTo(addOns);
            await shown(addOns);

            expect(view.addOns().map(({ name, state }) => [name, state])).toEqual([
                ["orders", "new"],
            ]);
        });

        it("shows an allowed config's own package as allowed once a lint read its config", async () => {
            const { host, install, rulePackageCatalog, addOns, view, rulePackageHashOf } = setUp({
                files: {},
            });
            install(ORDERS, "bpmnlint-plugin-orders", { "order.bpmn": "<definitions/>" });
            host.pluginApprovals.approvals = [
                { pluginId: ORDERS, contentHash: rulePackageHashOf(ORDERS, "selfPackage") },
            ];
            view.attachTo(addOns);
            await shown(addOns);
            const ordersRow = () => {
                const row = view.addOns().find(({ id }) => id === `rulePackage:${ORDERS}`);
                return [row?.state, row?.actions.map(({ kind }) => kind)];
            };
            const beforeLint = ordersRow();

            rulePackageCatalog.noteLintConfig(`${ORDERS}/.bpmnlintrc`);
            await shown(addOns);

            expect(beforeLint).toEqual(["changed", ["revoke"]]);
            expect(ordersRow()).toEqual(["approved", ["revoke"]]);
        });
    });

    describe("reviewing and allowing", () => {
        it("Review… on a row hashes it and offers allow", async () => {
            const { install, addOns, view, rulePackageHashOf } = setUp({ files: {} });
            install(ACME, "bpmnlint-plugin-acme");
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "inspect",
                addOnId: `rulePackage:${ACME}`,
            });
            await shown(addOns);

            const row = view.addOnNamed("bpmnlint-plugin-acme");
            expect(result).toEqual({
                kind: "done",
                message:
                    "Read bpmnlint-plugin-acme. Review what it covers, then allow this content.",
            });
            expect(row.actions.map(({ kind }) => kind)).toEqual(["allow"]);
            expect(row.review?.facts.at(-1)).toEqual({
                label: "Content hash",
                value: rulePackageHashOf(ACME),
            });
        });

        it("allows exactly the content the view showed", async () => {
            const { host, addOns, view } = setUp();
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision: view.latest().revision,
            });
            await shown(addOns);

            expect(result).toEqual({
                kind: "done",
                message: "Allowed Resize Tasks. Open editors reload with it.",
            });
            expect(host.pluginApprovals.approvals).toEqual([
                { pluginId: RESIZE, contentHash: RESIZE_HASH },
            ]);
            expect(view.addOnNamed("Resize Tasks").state).toBe("approved");
        });

        it("allows a rule package in two steps, Review… first", async () => {
            const { host, install, addOns, view, rulePackageHashOf } = setUp({ files: {} });
            install(ACME, "bpmnlint-plugin-acme");
            view.attachTo(addOns);
            await shown(addOns);
            await view.connection?.handle({ kind: "inspect", addOnId: `rulePackage:${ACME}` });
            await shown(addOns);

            await view.connection?.handle({
                kind: "allow",
                addOnId: `rulePackage:${ACME}`,
                revision: view.latest().revision,
            });

            expect(host.pluginApprovals.approvals).toEqual([
                { pluginId: ACME, contentHash: rulePackageHashOf(ACME) },
            ]);
        });

        it("refuses when the plugin changed after it was shown", async () => {
            const { host, addOns, view } = setUp();
            view.attachTo(addOns);
            await shown(addOns);
            const revision = view.latest().revision;
            // Changed without a watcher event, so only the fresh read before the allow sees it.
            host.workspace.files.set(`${RESIZE}/client.js`, "registerResizE();");

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision,
            });

            expect(result).toEqual({
                kind: "refused",
                reason: "changedSinceReview",
                message: "Resize Tasks changed after you reviewed it. Review it again, then allow.",
            });
            expect(host.pluginApprovals.approvals).toEqual([]);
        });

        it("refuses an unknown revision", async () => {
            const { host, addOns, view } = setUp();
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision: view.latest().revision + 1,
            });

            expect(result).toMatchObject({ kind: "refused", reason: "staleView" });
            expect(host.pluginApprovals.approvals).toEqual([]);
        });
    });

    describe("revoking", () => {
        it("revoking a plugin reloads its editors and removes its copy", async () => {
            const { host, plugins, addOns, view } = setUp();
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_HASH }];
            const editor = await host.openSession("/work/order.bpmn", [
                plugins.editorContribution.participant,
            ]);
            await plugins.editorContribution.commandHandlers.GetBpmnPluginsCommand(
                new GetBpmnPluginsCommand(),
                editor.id,
            );
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "revoke",
                addOnId: `plugin:${RESIZE}`,
            });
            await shown(addOns);

            expect(result).toEqual({
                kind: "done",
                message: "Revoked Resize Tasks. Open editors reload without it.",
            });
            expect(host.pluginApprovals.approvals).toEqual([]);
            expect(editor.reloadCount).toBe(1);
            expect(
                [...host.workspace.files.keys()].filter((path) => path.startsWith(CACHE)),
            ).toEqual([]);
            expect(view.addOnNamed("Resize Tasks").state).toBe("new");
        });

        it("asks no notice here about a plugin revoked from the view", async () => {
            const { host, plugins, addOns, view } = setUp();
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_HASH }];
            view.attachTo(addOns);
            await shown(addOns);
            await view.connection?.handle({ kind: "revoke", addOnId: `plugin:${RESIZE}` });

            const editor = await host.openSession("/work/order.bpmn", [
                plugins.editorContribution.participant,
            ]);
            await plugins.editorContribution.commandHandlers.GetBpmnPluginsCommand(
                new GetBpmnPluginsCommand(),
                editor.id,
            );
            await plugins.service.whenApprovalSettled();

            expect(host.actionNotifier.notices.map(({ id }) => id)).not.toContain(
                PLUGIN_APPROVAL_NOTICE_ID,
            );
        });

        it.each<{ restart: ProcessRestart; until: string }>([
            { restart: "reloadWindow", until: "reload the window" },
            { restart: "restartIde", until: "restart the IDE" },
        ])(
            "revoking a rule package says its code stays loaded until you $until",
            async ({ restart, until }) => {
                const { host, install, addOns, view, rulePackageHashOf } = setUp({
                    files: {},
                    restart,
                });
                install(ACME, "bpmnlint-plugin-acme");
                host.pluginApprovals.approvals = [
                    { pluginId: ACME, contentHash: rulePackageHashOf(ACME) },
                ];
                view.attachTo(addOns);
                await shown(addOns);

                const result = await view.connection?.handle({
                    kind: "revoke",
                    addOnId: `rulePackage:${ACME}`,
                });
                await shown(addOns);

                const stillLoaded = `Code it already ran stays loaded until you ${until}.`;
                expect(result).toEqual({
                    kind: "done",
                    message: `Revoked bpmnlint-plugin-acme. ${stillLoaded}`,
                });
                expect(host.pluginApprovals.approvals).toEqual([]);
                expect(view.addOnNamed("bpmnlint-plugin-acme").note).toBe(stillLoaded);
            },
        );

        it("asks no notice here about a rule package revoked from the view", async () => {
            const { host, install, addOns, view, rulePackageCatalog, rulePackageHashOf } = setUp({
                files: {},
            });
            install(ACME, "bpmnlint-plugin-acme");
            host.pluginApprovals.approvals = [
                { pluginId: ACME, contentHash: rulePackageHashOf(ACME) },
            ];
            view.attachTo(addOns);
            await shown(addOns);

            await view.connection?.handle({ kind: "revoke", addOnId: `rulePackage:${ACME}` });

            const blocked: BlockedRulePackage = {
                id: ACME,
                kind: "package",
                state: "new",
                needed: true,
            };
            expect(rulePackageCatalog.stillPendingOf([blocked])).toEqual([]);
        });

        it("refuses to revoke a rule package the view offered no revoke for, and its notice still asks", async () => {
            const { install, addOns, view, rulePackageCatalog } = setUp({ files: {} });
            install(ACME, "bpmnlint-plugin-acme");
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "revoke",
                addOnId: `rulePackage:${ACME}`,
            });

            expect(result).toMatchObject({ kind: "refused", reason: "notOffered" });
            expect(
                rulePackageCatalog
                    .stillPendingOf([{ id: ACME, kind: "package", state: "new", needed: true }])
                    .map(({ artifact }) => artifact.id),
            ).toEqual([ACME]);
        });

        it("refuses to allow again, at an older revision, a plugin revoked since", async () => {
            const { host, addOns, view } = setUp();
            host.pluginApprovals.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_HASH }];
            view.attachTo(addOns);
            await shown(addOns);
            const approvedAt = view.latest().revision;
            await view.connection?.handle({ kind: "revoke", addOnId: `plugin:${RESIZE}` });
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision: approvedAt,
            });

            expect(result).toMatchObject({ kind: "refused", reason: "notOffered" });
            expect(host.pluginApprovals.approvals).toEqual([]);
        });

        it("removes the plugin copies no stored approval names", async () => {
            const { host, addOns, view } = setUp({ files: {} });
            host.workspace.createDirectory(`${CACHE}/${"a".repeat(64)}`);
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({ kind: "pruneCache" });

            expect(result).toEqual({ kind: "done", message: "Removed 1 unused plugin copy." });
        });
    });

    describe("views", () => {
        it("an approval stored elsewhere reaches every visible view", async () => {
            const { host, addOns } = setUp();
            const first = new RecordingAddOnView();
            const second = new RecordingAddOnView();
            first.attachTo(addOns);
            second.attachTo(addOns);
            await shown(addOns);

            host.pluginApprovals.storeElsewhere([{ pluginId: RESIZE, contentHash: RESIZE_HASH }], {
                notify: true,
            });
            await shown(addOns);

            expect([first, second].map((view) => view.addOnNamed("Resize Tasks").state)).toEqual([
                "approved",
                "approved",
            ]);
        });

        it("builds nothing while no view is visible", async () => {
            const { host, addOns, view } = setUp();
            const readStored = vi.spyOn(host.pluginApprovals, "readStored");

            view.attachTo(addOns, false);
            addOns.refresh();
            await shown(addOns);

            expect(view.models).toEqual([]);
            expect(readStored).not.toHaveBeenCalled();
        });

        it("a hidden view gets the latest model when shown", async () => {
            const { host, addOns } = setUp();
            const visible = new RecordingAddOnView();
            const hidden = new RecordingAddOnView();
            visible.attachTo(addOns);
            const connection = hidden.attachTo(addOns, false);
            await shown(addOns);
            host.pluginApprovals.storeElsewhere([{ pluginId: RESIZE, contentHash: RESIZE_HASH }], {
                notify: true,
            });
            await shown(addOns);

            connection.setVisible(true);

            expect(hidden.models.map(({ revision }) => revision)).toEqual([
                visible.latest().revision,
            ]);
            expect(hidden.addOnNamed("Resize Tasks").state).toBe("approved");
        });

        it("reads the stored approvals again when a view becomes visible", async () => {
            const { host, addOns } = setUp();
            const view = new RecordingAddOnView();
            const connection = view.attachTo(addOns);
            await shown(addOns);
            connection.setVisible(false);

            host.pluginApprovals.storeElsewhere([{ pluginId: RESIZE, contentHash: RESIZE_HASH }]);
            connection.setVisible(true);
            await shown(addOns);

            expect(view.addOnNamed("Resize Tasks").state).toBe("approved");
        });

        it("lists a plugin added to a config folder", async () => {
            const { host, addOns, view } = setUp({ files: {} });
            view.attachTo(addOns);
            await shown(addOns);

            host.workspace.createDirectory(RESIZE, RESIZE_FILES);
            await shown(addOns);

            expect(view.addOns().map(({ name }) => name)).toEqual(["Resize Tasks"]);
        });

        it("lists again once the config folder setting changes", async () => {
            const other = "/work/.modeler/plugins/resize-tasks";
            const { host, settingChanges, addOns, view } = setUp({
                files: {
                    [`${other}/plugin.json`]: '{ "name": "Resize Tasks", "script": "client.js" }',
                    [`${other}/client.js`]: "registerResize();",
                },
            });
            view.attachTo(addOns);
            await shown(addOns);

            host.settings.values.configFolder = ".modeler";
            settingChanges.fire(settingChangeNaming(["configFolder"]));
            await shown(addOns);

            expect(view.addOns().map(({ name }) => name)).toEqual(["Resize Tasks"]);
        });

        it("lists again after a change that lands on any tick of a listing's end", async () => {
            for (let ticks = 0; ticks <= 40; ticks++) {
                const { host, addOns, view } = setUp();
                view.attachTo(addOns);
                await shown(addOns);
                const readStored = host.pluginApprovals.readStored.bind(host.pluginApprovals);
                let release = () => {};
                const released = new Promise<void>((resolve) => (release = resolve));
                vi.spyOn(host.pluginApprovals, "readStored").mockImplementationOnce(async () => {
                    await released;
                    return readStored();
                });

                addOns.refresh();
                release();
                for (let tick = 0; tick < ticks; tick++) await Promise.resolve();
                host.pluginApprovals.storeElsewhere([
                    { pluginId: RESIZE, contentHash: RESIZE_HASH },
                ]);
                addOns.refresh();
                await shown(addOns);

                expect({ ticks, state: view.addOnNamed("Resize Tasks").state }).toEqual({
                    ticks,
                    state: "approved",
                });
            }
        });

        it("keeps a view attached whose post throws, logs why, and still posts to the others", async () => {
            const { host, addOns } = setUp();
            const posted: number[] = [];
            const throwing = addOns.attachView((model) => {
                posted.push(model.revision);
                throw new Error("webview gone");
            }, true);
            const other = new RecordingAddOnView();
            other.attachTo(addOns);
            await shown(addOns);

            addOns.refresh();
            await shown(addOns);
            throwing.setVisible(false);
            throwing.setVisible(true);
            await shown(addOns);

            // Shown again, the throwing view gets the latest model, then the one read anew.
            expect(posted).toEqual([1, 2, 3, 3, 4]);
            expect(other.models.map(({ revision }) => revision)).toEqual([1, 2, 3, 4]);
            expect(host.notifier.logged("error")).toHaveLength(5);
        });

        it("posts nothing to a disposed view and refuses what it asks", async () => {
            const { host, addOns, view } = setUp();
            const connection = view.attachTo(addOns);
            await shown(addOns);
            const revision = view.latest().revision;
            connection.setVisible(false);

            connection.dispose();
            connection.setVisible(true);
            const result = await connection.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision,
            });
            await shown(addOns);

            expect(view.models).toHaveLength(1);
            expect(result).toMatchObject({ kind: "refused", reason: "closedView" });
            expect(host.pluginApprovals.approvals).toEqual([]);
        });

        it("stops watching and building once the last view is gone", async () => {
            const { host, addOns, view } = setUp();
            const connection = view.attachTo(addOns);
            await shown(addOns);

            connection.dispose();
            host.workspace.createDirectory(`${PLUGINS}/other`, {
                [`${PLUGINS}/other/plugin.json`]: '{ "name": "Other", "script": "client.js" }',
            });
            await shown(addOns);

            expect(view.models).toHaveLength(1);
            expect(host.workspace.watchers.filter(({ root }) => root === WORK)).toMatchObject([
                { disposed: true },
            ]);
        });
    });

    it("a referred item stays not allowed yet and no notice asks again", async () => {
        const { host, plugins, addOns, view } = setUp();
        const question = new ApprovalQuestion(
            plugins.catalog,
            { review: async () => ({ kind: "leftForView" as const }) },
            host.actionNotifier,
            host.workspace,
            new QuestionQueue(),
        );
        host.actionNotifier.noticeAnswers[PLUGIN_APPROVAL_NOTICE_ID] = "review";
        const { pending } = await plugins.catalog.pluginsFor("/work/order.bpmn");
        await question.ask(pending);
        view.attachTo(addOns);
        await shown(addOns);

        await question.ask(pending);

        expect(view.addOnNamed("Resize Tasks").state).toBe("new");
        expect(host.actionNotifier.notices.map(({ id }) => id)).toEqual([
            PLUGIN_APPROVAL_NOTICE_ID,
        ]);
    });
});
