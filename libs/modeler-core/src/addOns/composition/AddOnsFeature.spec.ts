import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
    OpenAddOnDetailCommand,
    ShowAddOnQuery,
    ADD_ONS_VIEW_COMMAND_TYPES,
    AddOnActionResultQuery,
    AddOnCatalogQuery,
    AddOnAboutQuery,
    AddOnRequestCommand,
    GetAddOnCatalogCommand,
    GetAddOnAboutCommand,
    GetBpmnPluginsCommand,
    Query,
    RevealAddOnsQuery,
} from "@miragon/bpmn-modeler-shared";

import { BpmnPluginsFeature } from "../../bpmnPlugins/composition/BpmnPluginsFeature";
import {
    approvedContent,
    PLUGIN_APPROVAL_NOTICE_ID,
} from "../../bpmnPlugins/domain/pluginApproval";
import { settingChangeNaming, SettingChange } from "../../editorSession/domain/EditorSession";
import {
    Allowance,
    allowanceKeyOf,
    allowanceOf,
    allowanceRowOf,
    LOCAL_HOST,
} from "../../kernel/domain/allowance";
import { ProcessRestart } from "../../kernel/domain/approvableCodeTexts";
import { AllowanceKind } from "../../kernel/domain/approvalRowKind";
import { revoking } from "../../kernel/domain/codeApproval";
import { AllowanceLocator } from "../../kernel/service/AllowanceLocator";
import { ArtifactService } from "../../kernel/service/ArtifactService";
import { ApprovalQuestion } from "../../kernel/service/ApprovalQuestion";
import { ContentRowMigration } from "../../kernel/service/ContentRowMigration";
import { ListReview } from "../../kernel/adapter/out/ListReview";
import { ViewReview } from "../adapter/out/ViewReview";
import { QuestionQueue } from "../../kernel/service/QuestionQueue";
import {
    BlockedRulePackage,
    RULE_PACKAGE_APPROVAL_NOTICE_ID,
    rulePackageOf,
} from "../../modeler/bpmn/domain/rulePackageApproval";
import { RulePackageCatalog } from "../../modeler/bpmn/service/RulePackageCatalog";
import { RulePackageInventory } from "../../modeler/bpmn/service/RulePackageInventory";
import { ContentHasherPort } from "../../bpmnPlugins/port/pluginPorts";
import { BpmnElementTemplatesService } from "../../modeler/bpmn/service/BpmnElementTemplatesService";
import { LoadedTemplateDirs } from "../../modeler/bpmn/service/LoadedTemplateDirs";
import { TemplateInventory } from "../../modeler/bpmn/service/TemplateInventory";
import { createTemplateMarketplaceService } from "../../template-marketplace/composition/MarketplaceFeature";
import { MarketplaceCommands } from "../../template-marketplace/service/MarketplaceCommands";
import { MarketplaceInventory } from "../../template-marketplace/service/MarketplaceInventory";
import {
    createTestHost,
    InMemoryInstalledPackages,
    RecordingAddOnView,
    TestHostOptions,
    writeLinkedWorktree,
    writeRepository,
} from "../../testing";
import { UNTRUSTED_WORKSPACE_TEXT } from "../domain/addOnTexts";
import type { AddOnDetailPort, AddOnDetailTarget } from "../port/addOnViewPorts";
import { AddOnsFeature } from "./AddOnsFeature";

const WORK = "/work";
const TASK = "/task";
const PLUGINS = `${WORK}/.camunda/plugins`;
const RESIZE = `${PLUGINS}/resize-tasks`;
const TASK_RESIZE = `${TASK}/.camunda/plugins/resize-tasks`;
const ACME = `${WORK}/node_modules/bpmnlint-plugin-acme`;
const ACME_LABEL = "bpmnlint-plugin-acme@1.2.0";
const CACHE = "/storage/bpmn-plugins";
const MARKETPLACE_CACHE = "/storage/marketplaces";
const TEMPLATES = `${WORK}/.camunda/element-templates`;
const NESTED_TEMPLATES = `${WORK}/orders/.camunda/element-templates`;
const SHARED = `${WORK}/shared`;
const LOCAL = `${WORK}/local`;

/** A local marketplace whose one source serves one template. */
function marketplaceFiles(root: string, templateName: string): Record<string, string> {
    return {
        [`${root}/marketplace.json`]: JSON.stringify({ sources: [{ path: "element-templates" }] }),
        [`${root}/element-templates/${templateName}.json`]: JSON.stringify({
            id: templateName,
            name: templateName,
        }),
    };
}

const MARKETPLACE_FILES = {
    ...marketplaceFiles(SHARED, "Shared Mail"),
    ...marketplaceFiles(LOCAL, "Local CRM"),
};

function marketplaceGroupOf(view: RecordingAddOnView) {
    return view.latest().groups.find(({ id }) => id === "marketplaces");
}

const RESIZE_FILES = {
    [`${RESIZE}/plugin.json`]: '{ "name": "Resize Tasks", "script": "client.js" }',
    [`${RESIZE}/client.js`]: "registerResize();",
};
const TASK_RESIZE_FILES = {
    [`${TASK_RESIZE}/plugin.json`]: RESIZE_FILES[`${RESIZE}/plugin.json`],
    [`${TASK_RESIZE}/client.js`]: RESIZE_FILES[`${RESIZE}/client.js`],
};
/** Real SHA-256, so a copy's folder is named as the prune expects. */
const sha256Hasher: ContentHasherPort = {
    sha256: (text) => createHash("sha256").update(text).digest("hex"),
};
const RESIZE_HASH = sha256Hasher.sha256(approvedContent("registerResize();", undefined));

const inFolder = (kind: AllowanceKind, id: string): Allowance =>
    allowanceOf(kind, id, { kind: "noRepository" }, LOCAL_HOST);
/** A plugin of the repository at {@link WORK}, as its main and its linked worktree place it. */
const RESIZE_IN_REPOSITORY = allowanceOf(
    "plugin",
    RESIZE,
    { kind: "repository", commonDir: `${WORK}/.git`, worktreeRoot: WORK },
    LOCAL_HOST,
);

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
    marketplaces: listsMarketplaces = true,
    switches: keepsSwitches = true,
    trustUnwired = false,
    detail,
    ...hostOptions
}: {
    files?: Record<string, string>;
    folders?: string[];
    restart?: ProcessRestart;
    marketplaces?: boolean;
    switches?: boolean;
    /** The host wires no trust port; the fake's trust still changes, reaching nothing. */
    trustUnwired?: boolean;
    /** The host opens an add-on's details in an editor tab. */
    detail?: AddOnDetailPort;
} & Pick<TestHostOptions, "settings" | "promptAnswers" | "marketplaceAnswers"> = {}) {
    const host = createTestHost({ folders, files, ...hostOptions });
    const artifacts = new ArtifactService(host.workspace, host.settings, host.notifier);
    // One disk for the packages and the git files; a plugin folder not on it is a folder origin.
    const disk = new InMemoryInstalledPackages();
    const allowances = new AllowanceLocator(disk, LOCAL_HOST);
    const contentRows = new ContentRowMigration(host.pluginApprovals, allowances, host.notifier);
    const plugins = new BpmnPluginsFeature({
        ...host,
        allowances,
        contentRows,
        artifacts,
        approvals: host.pluginApprovals,
        cacheRoot: CACHE,
        hasher: sha256Hasher,
        questions: new QuestionQueue(),
    });
    const install = (dir: string, name: string, files: Record<string, string> = {}) => {
        disk.writeFile(`${dir}/package.json`, JSON.stringify({ name, version: "1.2.0" }));
        disk.writeFile(`${dir}/index.js`, `module.exports = "${name}";`);
        Object.entries(files).forEach(([relPath, text]) =>
            disk.writeFile(`${dir}/${relPath}`, text),
        );
    };
    /** The repository at {@link WORK} with a linked worktree at {@link TASK}, each with the plugin folder on disk. */
    const layOutWorktrees = () => {
        writeRepository(disk, WORK);
        writeLinkedWorktree(disk, WORK, TASK);
        disk.createDirectory(RESIZE);
        disk.createDirectory(TASK_RESIZE);
    };
    const rulePackageCatalog = new RulePackageCatalog(
        host.pluginApprovals,
        host.workspaceTrust,
        host.notifier,
    );
    const rulePackageInventory = new RulePackageInventory(rulePackageCatalog, disk, allowances);
    const settingChanges = new ScriptedSettingChanges();
    const loadedTemplateDirs = new LoadedTemplateDirs();
    const templatesService = new BpmnElementTemplatesService(
        host.store,
        host.documents,
        artifacts,
        host.statusBar,
        host.notifier,
        loadedTemplateDirs,
    );
    const marketplaceService = createTemplateMarketplaceService({
        workspace: host.workspace,
        settings: host.settings,
        notifier: host.notifier,
        tokens: host.tokens,
        tokenPrompt: host.tokenPrompt,
        cacheRoot: MARKETPLACE_CACHE,
        homeDir: WORK,
    });
    const marketplaceCommands = new MarketplaceCommands({
        marketplaces: marketplaceService,
        templates: templatesService,
        registrations: host.marketplaceRegistrations,
        prompt: host.marketplacePrompt,
        picker: host.picker,
        notifier: host.notifier,
        actionNotifier: host.actionNotifier,
        homeDir: WORK,
    });
    const addOns = new AddOnsFeature({
        workspace: host.workspace,
        settings: host.settings,
        notifier: host.notifier,
        approvals: host.pluginApprovals,
        settingChanges,
        restart,
        contentRows,
        ...(trustUnwired ? {} : { workspaceTrust: host.workspaceTrust }),
        ...(detail && { detail }),
        plugins: plugins.inventory,
        rulePackages: rulePackageInventory,
        templates: new TemplateInventory(loadedTemplateDirs, artifacts),
        ...(keepsSwitches && { templatePreferences: host.templatePreferences }),
        ...(listsMarketplaces && {
            marketplaces: new MarketplaceInventory(
                host.marketplaceRegistrations,
                marketplaceService,
                marketplaceCommands,
                host.notifier,
            ),
        }),
    });
    const view = new RecordingAddOnView();
    const blockedPackageOf = (
        id: string,
        kind: BlockedRulePackage["kind"] = "package",
    ): BlockedRulePackage => ({
        ...rulePackageOf(id, disk.readTextFile(`${id}/package.json`), inFolder("rulePackage", id)),
        kind,
        state: "new",
        needed: true,
    });
    return {
        host,
        plugins,
        disk,
        install,
        layOutWorktrees,
        contentRows,
        rulePackageCatalog,
        rulePackageInventory,
        settingChanges,
        addOns,
        view,
        blockedPackageOf,
        templatesService,
        marketplaceCommands,
    };
}

function failListingOf(host: ReturnType<typeof createTestHost>, failing: string): void {
    const readDirectory = host.workspace.readDirectory.bind(host.workspace);
    vi.spyOn(host.workspace, "readDirectory").mockImplementation((path) =>
        path === failing ? Promise.reject(new Error("cache unreadable")) : readDirectory(path),
    );
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
                { id: `rulePackage:${ACME}`, name: ACME_LABEL, state: "new", actions: ["allow"] },
            ]);
        });

        it("lists a plugin its repository's allowance covers as Allowed, and the build writes nothing", async () => {
            const { host, layOutWorktrees, addOns, view } = setUp();
            layOutWorktrees();
            host.pluginApprovals.approvals = [allowanceRowOf(RESIZE_IN_REPOSITORY)];

            view.attachTo(addOns);
            await shown(addOns);

            expect(
                view
                    .addOns()
                    .map(({ name, stateText, actions }) => [
                        name,
                        stateText,
                        actions.map(({ label }) => label),
                    ]),
            ).toEqual([["Resize Tasks", "Allowed", ["Revoke"]]]);
            expect(host.pluginApprovals.receivedChanges).toEqual([]);
        });

        it("gives the rows of two worktrees of one repository one state", async () => {
            const { host, layOutWorktrees, addOns, view } = setUp({
                folders: [WORK, TASK],
                files: { ...RESIZE_FILES, ...TASK_RESIZE_FILES },
            });
            layOutWorktrees();
            view.attachTo(addOns);
            await shown(addOns);
            const statesBefore = view.addOns().map(({ id, state }) => [id, state]);

            host.pluginApprovals.storeElsewhere([allowanceRowOf(RESIZE_IN_REPOSITORY)], {
                notify: true,
            });
            await shown(addOns);

            expect(statesBefore).toEqual([
                [`plugin:${RESIZE}`, "new"],
                [`plugin:${TASK_RESIZE}`, "new"],
            ]);
            expect(view.addOns().map(({ id, state }) => [id, state])).toEqual([
                [`plugin:${RESIZE}`, "approved"],
                [`plugin:${TASK_RESIZE}`, "approved"],
            ]);
        });

        it("lists no row for an allowance or a row whose add-on this folder lacks", async () => {
            const { host, addOns, view } = setUp({ files: {} });
            host.pluginApprovals.approvals = [
                { pluginId: `${PLUGINS}/removed`, contentHash: "a".repeat(64) },
                allowanceRowOf(inFolder("plugin", `${PLUGINS}/removed`)),
                allowanceRowOf(inFolder("rulePackage", ACME)),
            ];

            view.attachTo(addOns);
            await shown(addOns);

            expect(view.addOns()).toEqual([]);
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
            const { install, rulePackageInventory, addOns, view } = setUp({ files: {} });
            install(`${ORDERS}/node_modules/bpmnlint-plugin-orders`, "bpmnlint-plugin-orders");
            rulePackageInventory.noteLintConfig(`${ORDERS}/.bpmnlintrc`);

            view.attachTo(addOns);
            await shown(addOns);

            expect(view.addOns().map(({ name }) => name)).toEqual(["bpmnlint-plugin-orders@1.2.0"]);
        });

        it("lists a config's own package the gate reported, and allows it", async () => {
            const { host, install, rulePackageInventory, addOns, view, blockedPackageOf } = setUp({
                files: {},
            });
            install(ORDERS, "bpmnlint-plugin-orders", { "order.bpmn": "<definitions/>" });
            rulePackageInventory.noteSeen([blockedPackageOf(ORDERS, "selfPackage")]);
            view.attachTo(addOns);
            await shown(addOns);
            const listed = view.addOns().map(({ name, state }) => [name, state]);

            await view.connection?.handle({
                kind: "allow",
                addOnId: `rulePackage:${ORDERS}`,
                revision: view.latest().revision,
            });
            await shown(addOns);

            expect(listed).toEqual([["bpmnlint-plugin-orders@1.2.0", "new"]]);
            expect(host.pluginApprovals.approvals).toEqual([
                allowanceRowOf(inFolder("rulePackage", ORDERS)),
            ]);
            expect(view.addOns().map(({ state }) => state)).toEqual(["approved"]);
        });
    });

    describe("workspace trust", () => {
        it("offers no Allow in a project the user did not trust, says why, and refuses an allow", async () => {
            const { host, install, addOns, view } = setUp();
            install(ACME, "bpmnlint-plugin-acme");
            host.workspaceTrust.setTrusted(false);
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision: view.latest().revision,
            });

            expect(
                view.addOns().map(({ name, actions, problem }) => ({
                    name,
                    actions: actions.map(({ kind }) => kind),
                    problem,
                })),
            ).toEqual([
                { name: "Resize Tasks", actions: [], problem: UNTRUSTED_WORKSPACE_TEXT },
                { name: ACME_LABEL, actions: [], problem: UNTRUSTED_WORKSPACE_TEXT },
            ]);
            expect(result).toMatchObject({ kind: "refused", reason: "notOffered" });
            expect(host.pluginApprovals.receivedChanges).toEqual([]);
        });

        it("offers Allow without a problem where the host wires no trust", async () => {
            const { host, addOns, view } = setUp({ trustUnwired: true });
            host.workspaceTrust.setTrusted(false);
            view.attachTo(addOns);
            await shown(addOns);

            const resize = view.codeAddOnNamed("Resize Tasks");
            expect(resize.actions.map(({ kind }) => kind)).toEqual(["allow"]);
            expect(resize.problem).toBeUndefined();
        });

        it.each([
            { change: "trusts it", before: false, actions: ["allow"] },
            { change: "withdraws the trust", before: true, actions: [] },
        ])("lists the add-ons again once the user $change", async ({ before, actions }) => {
            const { host, addOns, view } = setUp();
            host.workspaceTrust.setTrusted(before);
            view.attachTo(addOns);
            await shown(addOns);

            host.workspaceTrust.setTrusted(!before);
            await shown(addOns);

            expect(view.codeAddOnNamed("Resize Tasks").actions.map(({ kind }) => kind)).toEqual(
                actions,
            );
        });
    });

    describe("allowing", () => {
        it("allows a plugin in one step, as one allowance row", async () => {
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
                allowanceRowOf(inFolder("plugin", RESIZE)),
            ]);
            expect(view.addOnNamed("Resize Tasks").state).toBe("approved");
        });

        it("allows a rule package in one step, as one allowance row, its review naming where it holds", async () => {
            const { host, install, addOns, view } = setUp({ files: {} });
            install(ACME, "bpmnlint-plugin-acme");
            view.attachTo(addOns);
            await shown(addOns);
            const facts = view.codeAddOnNamed(ACME_LABEL).review?.facts;

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `rulePackage:${ACME}`,
                revision: view.latest().revision,
            });

            expect(facts).toEqual([
                { label: "Folder", value: "node_modules/bpmnlint-plugin-acme" },
                { label: "Version", value: "1.2.0" },
                { label: "Allowed in", value: "this folder only" },
            ]);
            expect(result).toEqual({
                kind: "done",
                message: `Allowed ${ACME_LABEL}. Open editors lint again with it.`,
            });
            expect(host.pluginApprovals.approvals).toEqual([
                allowanceRowOf(inFolder("rulePackage", ACME)),
            ]);
        });

        it("allows in every worktree of a repository, and says so", async () => {
            const { host, layOutWorktrees, addOns, view } = setUp();
            layOutWorktrees();
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision: view.latest().revision,
            });

            expect(result).toEqual({
                kind: "done",
                message:
                    "Allowed Resize Tasks in every worktree of its repository. Open editors reload with it.",
            });
            expect(host.pluginApprovals.approvals).toEqual([allowanceRowOf(RESIZE_IN_REPOSITORY)]);
        });

        it("offers Allow at once for a rule package a notice left to the view", async () => {
            const {
                host,
                install,
                rulePackageCatalog,
                rulePackageInventory,
                addOns,
                view,
                blockedPackageOf,
            } = setUp({ files: {} });
            install(ACME, "bpmnlint-plugin-acme");
            const found = [blockedPackageOf(ACME)];
            rulePackageInventory.noteSeen(found);
            host.actionNotifier.noticeAnswers[RULE_PACKAGE_APPROVAL_NOTICE_ID] = "review";
            await new ApprovalQuestion(
                rulePackageCatalog,
                { review: async () => ({ kind: "leftForView" as const }) },
                host.actionNotifier,
                host.workspace,
                new QuestionQueue(),
            ).ask(found);

            view.attachTo(addOns);
            await shown(addOns);

            const row = view.codeAddOnNamed(ACME_LABEL);
            expect([row.stateText, row.actions.map(({ label }) => label)]).toEqual([
                "Not allowed yet",
                ["Allow"],
            ]);
        });

        it("allows a plugin whose content changed after it was shown, as the allowance covers later changes", async () => {
            const { host, addOns, view } = setUp();
            view.attachTo(addOns);
            await shown(addOns);
            const revision = view.latest().revision;
            host.workspace.files.set(`${RESIZE}/client.js`, "registerResizE();");

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision,
            });

            expect(result).toMatchObject({ kind: "done" });
            expect(host.pluginApprovals.approvals).toEqual([
                allowanceRowOf(inFolder("plugin", RESIZE)),
            ]);
        });

        it("refuses as stale once the shown folder moved into a repository", async () => {
            const { host, disk, addOns, view } = setUp();
            disk.createDirectory(RESIZE);
            view.attachTo(addOns);
            await shown(addOns);
            const revision = view.latest().revision;
            // Without a watcher event, so only the fresh read before the allow sees it.
            writeRepository(disk, WORK);

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision,
            });

            expect(result).toEqual({
                kind: "refused",
                reason: "staleView",
                message: "The list changed since you looked at it. Check it again, then allow.",
            });
            expect(host.pluginApprovals.approvals).toEqual([]);
        });

        it("refuses a plugin gone since it was shown", async () => {
            const { host, addOns, view } = setUp();
            view.attachTo(addOns);
            await shown(addOns);
            const revision = view.latest().revision;
            await host.workspace.deleteDirectory(RESIZE);

            const result = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision,
            });

            expect(result).toEqual({
                kind: "refused",
                reason: "gone",
                message: "Resize Tasks is gone.",
            });
            expect(host.pluginApprovals.approvals).toEqual([]);
        });

        it("refuses a revision a view kept from a process that is gone", async () => {
            vi.useFakeTimers({ toFake: ["Date"] });
            try {
                vi.setSystemTime(1_000);
                const before = setUp();
                before.view.attachTo(before.addOns);
                await shown(before.addOns);
                before.addOns.refresh();
                await shown(before.addOns);
                const keptRevision = before.view.latest().revision;
                before.addOns.dispose();

                vi.setSystemTime(1_001);
                const { host, addOns, view } = setUp();
                const respawned = view.attachTo(addOns);
                await shown(addOns);
                addOns.refresh();
                await shown(addOns);
                const result = await respawned.handle({
                    kind: "allow",
                    addOnId: `plugin:${RESIZE}`,
                    revision: keptRevision,
                });

                expect(result).toMatchObject({ kind: "refused", reason: "staleView" });
                expect(host.pluginApprovals.approvals).toEqual([]);
            } finally {
                vi.useRealTimers();
            }
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
        it("revoking a plugin reloads its editors and leaves its copy to age out", async () => {
            const { host, plugins, addOns, view } = setUp();
            host.pluginApprovals.approvals = [allowanceRowOf(inFolder("plugin", RESIZE))];
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
                [...host.workspace.files.keys()].filter((path) => path.startsWith(CACHE)).sort(),
            ).toEqual([`${CACHE}/${RESIZE_HASH}/last-used`, `${CACHE}/${RESIZE_HASH}/plugin.js`]);
            expect(view.addOnNamed("Resize Tasks").state).toBe("new");
        });

        it("revokes a plugin without reading the plugin cache", async () => {
            const { host, addOns, view } = setUp();
            host.pluginApprovals.approvals = [allowanceRowOf(inFolder("plugin", RESIZE))];
            view.attachTo(addOns);
            await shown(addOns);
            failListingOf(host, CACHE);

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
            expect(host.notifier.logged("error")).toEqual([]);
        });

        it("asks no notice here about a plugin revoked from the view", async () => {
            const { host, plugins, addOns, view } = setUp();
            host.pluginApprovals.approvals = [allowanceRowOf(inFolder("plugin", RESIZE))];
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
                const { host, install, addOns, view } = setUp({ files: {}, restart });
                install(ACME, "bpmnlint-plugin-acme");
                host.pluginApprovals.approvals = [allowanceRowOf(inFolder("rulePackage", ACME))];
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
                    message: `Revoked ${ACME_LABEL}. ${stillLoaded}`,
                });
                expect(host.pluginApprovals.approvals).toEqual([]);
                expect(view.codeAddOnNamed(ACME_LABEL).note).toBe(stillLoaded);
            },
        );

        it("asks no notice here about a rule package revoked from the view", async () => {
            const { host, install, addOns, view, rulePackageCatalog, blockedPackageOf } = setUp({
                files: {},
            });
            install(ACME, "bpmnlint-plugin-acme");
            host.pluginApprovals.approvals = [allowanceRowOf(inFolder("rulePackage", ACME))];
            view.attachTo(addOns);
            await shown(addOns);

            await view.connection?.handle({ kind: "revoke", addOnId: `rulePackage:${ACME}` });

            expect(rulePackageCatalog.stillPendingOf([blockedPackageOf(ACME)])).toEqual([]);
        });

        it("refuses to revoke a rule package the view offered no revoke for, and its notice still asks", async () => {
            const { install, addOns, view, rulePackageCatalog, blockedPackageOf } = setUp({
                files: {},
            });
            install(ACME, "bpmnlint-plugin-acme");
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "revoke",
                addOnId: `rulePackage:${ACME}`,
            });

            expect(result).toMatchObject({ kind: "refused", reason: "notOffered" });
            expect(
                rulePackageCatalog.stillPendingOf([blockedPackageOf(ACME)]).map(({ id }) => id),
            ).toEqual([ACME]);
        });

        it("refuses to allow again, at an older revision, a plugin revoked since", async () => {
            const { host, addOns, view } = setUp();
            host.pluginApprovals.approvals = [allowanceRowOf(inFolder("plugin", RESIZE))];
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

        it("Revoke takes the allowance and every local row pinned to content located to it, in one write", async () => {
            const { host, layOutWorktrees, addOns, view } = setUp();
            layOutWorktrees();
            const unlocated = {
                pluginId: "/old-clone/.camunda/plugins/resize-tasks",
                contentHash: RESIZE_HASH,
            };
            const otherPlugin = allowanceRowOf(
                inFolder("plugin", "/other/.camunda/plugins/palette"),
            );
            host.pluginApprovals.approvals = [
                unlocated,
                { pluginId: RESIZE, contentHash: RESIZE_HASH },
                { pluginId: TASK_RESIZE, contentHash: "c".repeat(64) },
                allowanceRowOf(RESIZE_IN_REPOSITORY),
                otherPlugin,
            ];
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({
                kind: "revoke",
                addOnId: `plugin:${RESIZE}`,
            });
            await shown(addOns);

            expect(result).toEqual({
                kind: "done",
                message:
                    "Revoked Resize Tasks in every worktree of its repository. Open editors reload without it.",
            });
            expect(host.pluginApprovals.receivedChanges).toEqual([
                revoking([allowanceKeyOf(RESIZE_IN_REPOSITORY), RESIZE, TASK_RESIZE]),
            ]);
            expect(host.pluginApprovals.approvals).toEqual([unlocated, otherPlugin]);
        });

        it("Revoke waits for the start-up rewrite, so the allowance it writes is revoked too", async () => {
            const { host, layOutWorktrees, contentRows, addOns, view } = setUp();
            layOutWorktrees();
            const store = host.pluginApprovals;
            store.approvals = [{ pluginId: RESIZE, contentHash: RESIZE_HASH }];
            view.attachTo(addOns);
            await shown(addOns);
            let landMigration = () => undefined as void;
            const change = store.change.bind(store);
            vi.spyOn(store, "change").mockImplementationOnce(async (migration) => {
                await new Promise<void>((resolve) => (landMigration = resolve));
                await change(migration);
            });
            const migrated = contentRows.run();

            const revoked = view.connection?.handle({
                kind: "revoke",
                addOnId: `plugin:${RESIZE}`,
            });
            await vi.waitFor(() => expect(store.change).toHaveBeenCalledTimes(1));
            const changesWhileMigrating = store.receivedChanges.length;
            landMigration();
            await migrated;
            await revoked;

            expect(changesWhileMigrating).toBe(0);
            expect(store.approvals).toEqual([]);
        });

        it("Revoke of an unreadable but allowed plugin takes its allowance", async () => {
            const broken = `${PLUGINS}/broken`;
            const { host, addOns, view } = setUp({
                files: { [`${broken}/plugin.json`]: '{ "name": "Broken", "script": "client.js" }' },
            });
            host.pluginApprovals.approvals = [allowanceRowOf(inFolder("plugin", broken))];
            view.attachTo(addOns);
            await shown(addOns);
            const actions = view.codeAddOnNamed("broken").actions.map(({ kind }) => kind);

            const result = await view.connection?.handle({
                kind: "revoke",
                addOnId: `plugin:${broken}`,
            });

            expect(actions).toEqual(["revoke"]);
            expect(result).toMatchObject({ kind: "done" });
            expect(host.pluginApprovals.approvals).toEqual([]);
        });

        it("after Revoke no notice here asks about another worktree of that allowance", async () => {
            const { host, plugins, layOutWorktrees, addOns, view } = setUp({
                folders: [WORK, TASK],
                files: { ...RESIZE_FILES, ...TASK_RESIZE_FILES },
            });
            layOutWorktrees();
            host.pluginApprovals.approvals = [allowanceRowOf(RESIZE_IN_REPOSITORY)];
            view.attachTo(addOns);
            await shown(addOns);
            await view.connection?.handle({ kind: "revoke", addOnId: `plugin:${RESIZE}` });

            const editor = await host.openSession(`${TASK}/order.bpmn`, [
                plugins.editorContribution.participant,
            ]);
            await plugins.editorContribution.commandHandlers.GetBpmnPluginsCommand(
                new GetBpmnPluginsCommand(),
                editor.id,
            );
            await plugins.service.whenApprovalSettled();

            expect(host.pluginApprovals.approvals).toEqual([]);
            expect(host.actionNotifier.notices.map(({ id }) => id)).not.toContain(
                PLUGIN_APPROVAL_NOTICE_ID,
            );
        });

        it("removes the plugin copies no editor is served, however recently used", async () => {
            const { addOns, view } = setUp({
                files: { [`${CACHE}/${"a".repeat(64)}/last-used`]: String(Date.now()) },
            });
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection?.handle({ kind: "pruneCache" });

            expect(result).toEqual({ kind: "done", message: "Removed 1 unused plugin copy." });
        });
        it("answers that removing the plugin copies failed, and logs why", async () => {
            const { host, addOns, view } = setUp({ files: {} });
            view.attachTo(addOns);
            await shown(addOns);
            failListingOf(host, CACHE);

            const result = await view.connection?.handle({ kind: "pruneCache" });

            expect(result).toEqual({
                kind: "failed",
                message: "Could not remove the unused plugin copies. The log says why.",
            });
            expect(host.notifier.logged("error")).toEqual([
                expect.stringContaining("cache unreadable"),
            ]);
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
            vi.useFakeTimers({ toFake: ["Date"] });
            try {
                vi.setSystemTime(5);
                const { addOns, view } = setUp();
                view.attachTo(addOns, false);
                addOns.refresh();
                await shown(addOns);

                const visible = new RecordingAddOnView();
                visible.attachTo(addOns);
                await shown(addOns);

                expect(view.models).toEqual([]);
                // Revisions count from the clock, so the first build is the one after 5 ms.
                expect(visible.models.map(({ revision }) => revision)).toEqual([5_001]);
            } finally {
                vi.useRealTimers();
            }
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
            const builds = (revisions: number[]) => revisions.map((each) => each - posted[0] + 1);
            expect(builds(posted)).toEqual([1, 2, 3, 3, 4]);
            expect(builds(other.models.map(({ revision }) => revision))).toEqual([1, 2, 3, 4]);
            expect(host.notifier.logged("error")).toHaveLength(5);
        });

        it("tells every visible view when the first listing fails", async () => {
            const { host, addOns, view } = setUp();
            vi.spyOn(host.pluginApprovals, "readStored").mockRejectedValueOnce(
                new Error("store unreadable"),
            );

            view.attachTo(addOns);
            await shown(addOns);

            expect(view.latest()).toMatchObject({
                groups: [],
                problem: "Could not list the add-ons. The log says why.",
            });
            expect(host.notifier.logged("error")).toHaveLength(1);
        });

        it("claims no earlier list when the first listing fails again", async () => {
            const { host, addOns, view } = setUp();
            vi.spyOn(host.pluginApprovals, "readStored")
                .mockRejectedValueOnce(new Error("store unreadable"))
                .mockRejectedValueOnce(new Error("store unreadable"));

            view.attachTo(addOns);
            await shown(addOns);
            addOns.refresh();
            await shown(addOns);

            expect(view.models).toHaveLength(2);
            expect(view.latest()).toMatchObject({
                groups: [],
                problem: "Could not list the add-ons. The log says why.",
            });
        });

        it("keeps what a view showed when a later listing fails, and clears the problem once one succeeds", async () => {
            const { host, addOns, view } = setUp();
            view.attachTo(addOns);
            await shown(addOns);
            const before = view.latest();
            vi.spyOn(host.pluginApprovals, "readStored").mockRejectedValueOnce(
                new Error("store unreadable"),
            );

            addOns.refresh();
            await shown(addOns);
            const failed = view.latest();
            const allowed = await view.connection?.handle({
                kind: "allow",
                addOnId: `plugin:${RESIZE}`,
                revision: failed.revision,
            });
            await shown(addOns);

            expect(failed).toEqual({
                ...before,
                problem:
                    "Could not list the add-ons again. The list shows what it read before; the log says why.",
            });
            expect(allowed).toMatchObject({ kind: "done" });
            expect(view.latest().problem).toBeUndefined();
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

    describe("panels", () => {
        const REVEALED = [`plugin:${RESIZE}`];
        const ROWS = { kind: "rows", addOnIds: REVEALED };
        const NEEDS_REVIEW = { kind: "needsReview" };

        function recordingPanel() {
            const posted: Query[] = [];
            return {
                posted,
                post: (message: Query) => posted.push(message),
                types: () => posted.map(({ type }) => type),
                models: () =>
                    posted.flatMap((each) =>
                        each instanceof AddOnCatalogQuery ? [each.model] : [],
                    ),
                reveals: () =>
                    posted.flatMap((each) => {
                        if (!(each instanceof RevealAddOnsQuery)) return [];
                        const { revealId: _revealId, ...target } = each.reveal;
                        return [target];
                    }),
                revealIds: () =>
                    posted.flatMap((each) =>
                        each instanceof RevealAddOnsQuery ? [each.reveal.revealId] : [],
                    ),
            };
        }

        describe("a detail's README and license", () => {
            it("reads a plugin's README and package.json license in its folder", async () => {
                const { addOns } = setUp({
                    files: {
                        ...RESIZE_FILES,
                        [`${RESIZE}/README.md`]: "# Resize Tasks",
                        [`${RESIZE}/package.json`]: '{ "license": "MIT" }',
                    },
                });
                const page = recordingPanel();
                const list = addOns.attachPanel(page.post, true);
                await shown(addOns);

                await list.handle(new GetAddOnAboutCommand(`plugin:${RESIZE}`));

                expect(page.posted.at(-1)).toEqual(
                    new AddOnAboutQuery(`plugin:${RESIZE}`, {
                        readme: { kind: "shown", markdown: "# Resize Tasks", truncated: false },
                        license: {
                            kind: "known",
                            text: "MIT",
                            label: "License: MIT, as its package.json says",
                        },
                    }),
                );
            });

            it("reads nothing for an id the catalog did not list, so a page never names a path", async () => {
                const { addOns } = setUp({ files: { ...RESIZE_FILES, "/etc/README.md": "secret" } });
                const page = recordingPanel();
                const list = addOns.attachPanel(page.post, true);
                await shown(addOns);

                await list.handle(new GetAddOnAboutCommand("plugin:/etc"));

                expect(page.posted.at(-1)).toEqual(new AddOnAboutQuery("plugin:/etc", { readme: { kind: "none" } }));
            });

            it("reads a marketplace's README the update cached", async () => {
                const { addOns, view } = setUp({
                    files: { ...MARKETPLACE_FILES, [`${LOCAL}/README.md`]: "Local templates." },
                    marketplaceAnswers: [{ location: LOCAL, scope: "project" }],
                });
                view.attachTo(addOns);
                const page = recordingPanel();
                const list = addOns.attachPanel(page.post, true);
                await shown(addOns);
                await view.connection!.handle({ kind: "addMarketplace" });
                await shown(addOns);
                const [source] = marketplaceGroupOf(view)?.sources ?? [];

                await list.handle(new GetAddOnAboutCommand(source.id));

                expect(page.posted.at(-1)).toEqual(
                    new AddOnAboutQuery(source.id, {
                        readme: { kind: "shown", markdown: "Local templates.", truncated: false },
                    }),
                );
            });
        });

        describe("a detail tab", () => {
            function recordingDetail() {
                const opened: AddOnDetailTarget[] = [];
                return { opened, open: (target: AddOnDetailTarget) => opened.push(target) };
            }

            it("opens the clicked add-on's details with the core's title", async () => {
                const detail = recordingDetail();
                const { addOns } = setUp({ detail });
                const list = addOns.attachPanel(recordingPanel().post, true);
                await shown(addOns);

                await list.handle(new OpenAddOnDetailCommand(`plugin:${RESIZE}`));

                expect(detail.opened).toEqual([
                    { addOnId: `plugin:${RESIZE}`, title: "Add-on: Resize Tasks" },
                ]);
            });

            it("opens nothing for an add-on the list no longer holds, and says so in the log", async () => {
                const detail = recordingDetail();
                const { host, addOns } = setUp({ detail });
                const list = addOns.attachPanel(recordingPanel().post, true);
                await shown(addOns);

                await list.handle(new OpenAddOnDetailCommand("plugin:/gone"));

                expect(detail.opened).toEqual([]);
                expect(host.notifier.logged("warning")).toContain(
                    "Opened no add-on details: the list no longer holds the add-on.",
                );
            });

            it("tells its page which add-on it shows before the catalog, and again when it loads", async () => {
                const { addOns } = setUp();
                const page = recordingPanel();
                const tab = addOns.attachPanel(page.post, true, { shows: `plugin:${RESIZE}` });
                await shown(addOns);

                await tab.handle(new GetAddOnCatalogCommand());

                expect(page.types()).toEqual([
                    "ShowAddOnQuery",
                    "AddOnCatalogQuery",
                    "ShowAddOnQuery",
                    "AddOnCatalogQuery",
                ]);
            });

            it("shows another add-on when the tab is reused", async () => {
                const { addOns } = setUp();
                const page = recordingPanel();
                const tab = addOns.attachPanel(page.post, true, { shows: `plugin:${RESIZE}` });
                await shown(addOns);

                tab.show("plugin:/other");

                expect(page.posted.at(-1)).toEqual(new ShowAddOnQuery("plugin:/other"));
            });

            it("gets no reveal, which lands in the list", async () => {
                const { addOns } = setUp();
                const page = recordingPanel();
                addOns.attachPanel(page.post, true, { shows: `plugin:${RESIZE}` });
                await shown(addOns);

                addOns.reveal(REVEALED);
                addOns.revealNeedsReview();
                await shown(addOns);

                expect(page.reveals()).toEqual([]);
            });
        });

        it("routes every command of the add-ons view before a panel attaches", () => {
            const { addOns } = setUp();

            expect(
                ADD_ONS_VIEW_COMMAND_TYPES.map((type) => addOns.panelRoutes.routeOf(type)),
            ).toEqual(ADD_ONS_VIEW_COMMAND_TYPES.map(() => ({ kind: "handled" })));
        });

        it("gets each model as a query and answers an allow by the revision it showed", async () => {
            const { host, addOns } = setUp();
            const panel = recordingPanel();
            const attached = addOns.attachPanel(panel.post, true);
            await shown(addOns);
            const [shownModel] = panel.models();

            await attached.handle(
                new AddOnRequestCommand(3, {
                    kind: "allow",
                    addOnId: `plugin:${RESIZE}`,
                    revision: shownModel.revision,
                }),
            );
            await shown(addOns);

            expect(panel.posted).toContainEqual(
                new AddOnActionResultQuery(3, {
                    kind: "done",
                    message: "Allowed Resize Tasks. Open editors reload with it.",
                }),
            );
            expect(host.pluginApprovals.approvals).toEqual([
                allowanceRowOf(inFolder("plugin", RESIZE)),
            ]);
            expect(panel.models().at(-1)?.revision).toBeGreaterThan(shownModel.revision);
        });

        it("posts the last model again when its page loads", async () => {
            const { addOns } = setUp();
            const panel = recordingPanel();
            const attached = addOns.attachPanel(panel.post, true);
            await shown(addOns);

            await attached.handle(new GetAddOnCatalogCommand());

            expect(panel.types()).toEqual(["AddOnCatalogQuery", "AddOnCatalogQuery"]);
        });

        it("refuses what a disposed panel asks and posts nothing to it", async () => {
            const { addOns } = setUp();
            const panel = recordingPanel();
            const attached = addOns.attachPanel(panel.post, true);
            await shown(addOns);
            panel.posted.length = 0;

            attached.dispose();
            await attached.handle(new AddOnRequestCommand(1, { kind: "refresh" }));
            addOns.reveal(REVEALED);
            addOns.refresh();
            await shown(addOns);

            expect(panel.posted).toEqual([]);
        });

        it("reveals rows to each visible panel once", async () => {
            const { addOns } = setUp();
            const panel = recordingPanel();
            const attached = addOns.attachPanel(panel.post, true);
            await shown(addOns);

            addOns.reveal(REVEALED);
            attached.setVisible(false);
            attached.setVisible(true);
            await shown(addOns);

            expect(panel.reveals()).toEqual([ROWS]);
        });

        it("reveals rows to a hidden panel after the model once it is shown", async () => {
            const { addOns } = setUp();
            const visible = recordingPanel();
            const hidden = recordingPanel();
            addOns.attachPanel(visible.post, true);
            const attached = addOns.attachPanel(hidden.post, false);
            await shown(addOns);

            addOns.reveal(REVEALED);
            const beforeShown = hidden.types();
            attached.setVisible(true);

            expect(beforeShown).toEqual([]);
            expect(hidden.types()).toEqual(["AddOnCatalogQuery", "RevealAddOnsQuery"]);
        });

        it("reveals rows to a panel shown again once its page loads anew", async () => {
            const { addOns } = setUp();
            const panel = recordingPanel();
            const attached = addOns.attachPanel(panel.post, true);
            await shown(addOns);
            await attached.handle(new GetAddOnCatalogCommand());
            attached.setVisible(false);
            addOns.reveal(REVEALED);
            attached.setVisible(true);
            await shown(addOns);
            panel.posted.length = 0;

            await attached.handle(new GetAddOnCatalogCommand());

            expect(panel.reveals()).toEqual([ROWS]);
        });

        it("reveals the latest rows once to a panel that attaches after the reveal", async () => {
            const { addOns } = setUp();
            addOns.reveal(["plugin:/work/.camunda/plugins/older"]);
            addOns.reveal(REVEALED);
            const panel = recordingPanel();

            addOns.attachPanel(panel.post, true);
            await shown(addOns);

            expect(panel.reveals()).toEqual([ROWS]);
        });

        it("numbers a reveal above every reveal a process that is gone sent a kept page", () => {
            vi.useFakeTimers({ toFake: ["Date"] });
            try {
                vi.setSystemTime(1_000);
                const before = setUp();
                const keptPage = recordingPanel();
                before.addOns.attachPanel(keptPage.post, true);
                before.addOns.reveal(REVEALED);
                before.addOns.reveal(REVEALED);
                before.addOns.reveal(REVEALED);
                before.addOns.dispose();

                vi.setSystemTime(1_001);
                const { addOns } = setUp();
                const respawned = recordingPanel();
                addOns.attachPanel(respawned.post, true);
                addOns.reveal(REVEALED);

                expect(respawned.revealIds()[0]).toBeGreaterThan(Math.max(...keptPage.revealIds()));
            } finally {
                vi.useRealTimers();
            }
        });

        it("reveals what needs review once to a visible panel whose page listens", async () => {
            const { addOns } = setUp();
            const panel = recordingPanel();
            const attached = addOns.attachPanel(panel.post, true);
            await attached.handle(new GetAddOnCatalogCommand());
            await shown(addOns);

            addOns.revealNeedsReview();
            await attached.handle(new GetAddOnCatalogCommand());

            expect(panel.reveals()).toEqual([NEEDS_REVIEW]);
        });

        it("holds what needs review for a page that asks later, and only until it asked", async () => {
            const { addOns } = setUp();
            const panel = recordingPanel();
            const attached = addOns.attachPanel(panel.post, true);
            await shown(addOns);
            addOns.revealNeedsReview();
            panel.posted.length = 0;

            await attached.handle(new GetAddOnCatalogCommand());
            await attached.handle(new GetAddOnCatalogCommand());

            expect(panel.reveals()).toEqual([NEEDS_REVIEW]);
        });

        it("reveals what needs review to a hidden panel once it is shown", async () => {
            const { addOns } = setUp();
            const hidden = recordingPanel();
            const attached = addOns.attachPanel(hidden.post, false);

            addOns.revealNeedsReview();
            const beforeShown = hidden.reveals();
            attached.setVisible(true);

            expect(beforeShown).toEqual([]);
            expect(hidden.reveals()).toEqual([NEEDS_REVIEW]);
        });

        it.each([
            { first: "needs review", then: "rows", latest: ROWS },
            { first: "rows", then: "needs review", latest: NEEDS_REVIEW },
        ])(
            "reveals only the latest to a panel attached later: $first, then $then",
            async ({ latest }) => {
                const { addOns } = setUp();
                const revealInOrder =
                    latest === ROWS
                        ? [() => addOns.revealNeedsReview(), () => addOns.reveal(REVEALED)]
                        : [() => addOns.reveal(REVEALED), () => addOns.revealNeedsReview()];
                revealInOrder.forEach((reveal) => reveal());
                const panel = recordingPanel();

                addOns.attachPanel(panel.post, true);
                await shown(addOns);

                expect(panel.reveals()).toEqual([latest]);
            },
        );

        it("numbers each reveal above the one before, whatever it shows", () => {
            const { addOns } = setUp();
            const panel = recordingPanel();
            addOns.attachPanel(panel.post, true);

            addOns.reveal(REVEALED);
            addOns.revealNeedsReview();
            addOns.reveal(REVEALED);

            const [first, second, third] = panel.revealIds();
            expect([second > first, third > second]).toEqual([true, true]);
        });

        it("logs a reveal its panel throws on, and still reveals to the others", async () => {
            const { host, addOns } = setUp();
            const other = recordingPanel();
            addOns.attachPanel((message) => {
                if (message instanceof RevealAddOnsQuery) throw new Error("webview gone");
            }, true);
            addOns.attachPanel(other.post, true);
            await shown(addOns);

            addOns.reveal(REVEALED);

            expect(other.reveals()).toEqual([ROWS]);
            expect(host.notifier.logged("error")).toHaveLength(1);
        });
    });

    describe("element templates", () => {
        it("lists workspace templates before any editor opened", async () => {
            const { addOns, view } = setUp({
                files: {
                    ...RESIZE_FILES,
                    [`${TEMPLATES}/mail.json`]: JSON.stringify({
                        id: "mail",
                        name: "Send Mail",
                        version: 2,
                        $schema:
                            "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
                    }),
                    [`${TEMPLATES}/broken.json`]: "{ not json",
                },
            });

            view.attachTo(addOns);
            await shown(addOns);

            expect(
                view.latest().groups[0].sources.map(({ id, addOns: rows }) => ({
                    id,
                    rows: rows.map((row) => [
                        row.kind,
                        row.name,
                        row.state,
                        row.detail,
                        "engineText" in row ? row.engineText : undefined,
                        row.problem === undefined ? undefined : "problem",
                    ]),
                })),
            ).toEqual([
                {
                    id: "config:/work/.camunda",
                    rows: [
                        [
                            "plugin",
                            "Resize Tasks",
                            "new",
                            "plugins/resize-tasks",
                            undefined,
                            undefined,
                        ],
                        [
                            "elementTemplate",
                            "Send Mail",
                            "enabled",
                            "Version 2",
                            "Camunda 8",
                            undefined,
                        ],
                        [
                            "elementTemplate",
                            "broken.json",
                            "enabled",
                            undefined,
                            undefined,
                            "problem",
                        ],
                    ],
                },
            ]);
        });

        it("lists the templates of a nested config folder once an editor loads them", async () => {
            const { host, templatesService, addOns, view } = setUp({
                files: {
                    [`${NESTED_TEMPLATES}/order.json`]: JSON.stringify({
                        id: "order",
                        name: "Order",
                    }),
                },
            });
            view.attachTo(addOns);
            await shown(addOns);
            const listedBefore = view.addOns().map(({ name }) => name);

            await templatesService.setElementTemplates(host.openEditor(`${WORK}/orders/o.bpmn`).id);
            await shown(addOns);

            expect([listedBefore, view.addOns().map(({ name }) => name)]).toEqual([[], ["Order"]]);
        });
    });

    describe("template switches", () => {
        const MAIL_FILES = {
            [`${TEMPLATES}/mail.json`]: JSON.stringify({
                id: "mail",
                name: "Send Mail",
                version: 2,
            }),
        };
        const SHOP_KEY = "configFolder:work/.camunda";

        function templateRow(view: RecordingAddOnView, name: string) {
            const { id, state, actions } = view.addOnNamed(name);
            return { id, state, actions: actions.map(({ kind }) => kind) };
        }

        it("disables a template where its source's switches live, and enables it again", async () => {
            const { host, addOns, view } = setUp({ files: MAIL_FILES });
            view.attachTo(addOns);
            await shown(addOns);
            const { id } = templateRow(view, "Send Mail");

            const disabled = await view.connection!.handle({ kind: "disable", addOnId: id });
            await shown(addOns);
            const afterDisable = templateRow(view, "Send Mail");
            const stored = host.templatePreferences.read();
            const enabled = await view.connection!.handle({ kind: "enable", addOnId: id });
            await shown(addOns);

            expect(disabled).toEqual({
                kind: "done",
                message:
                    "Disabled Send Mail. New elements no longer offer it; elements that use it keep it.",
            });
            expect(stored).toEqual({
                project: { disabled: [{ source: SHOP_KEY, templateId: "mail" }] },
                allProjects: { disabled: [] },
            });
            expect(afterDisable).toEqual({ id, state: "disabled", actions: ["enable"] });
            expect(enabled).toEqual({ kind: "done", message: "Enabled Send Mail." });
            expect(templateRow(view, "Send Mail")).toEqual({
                id,
                state: "enabled",
                actions: ["disable"],
            });
            expect(host.templatePreferences.read().project).toEqual({ disabled: [] });
        });

        it("switches a config folder's templates as a whole", async () => {
            const { host, addOns, view } = setUp({ files: { ...RESIZE_FILES, ...MAIL_FILES } });
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection!.handle({
                kind: "disableTemplates",
                sourceId: "config:/work/.camunda",
            });
            await shown(addOns);
            const [source] = view.latest().groups[0].sources;

            expect(result).toEqual({
                kind: "done",
                message:
                    "Disabled the templates of .camunda. New elements no longer offer them; elements that use them keep them.",
            });
            expect(host.templatePreferences.read().project).toEqual({
                disabled: [{ source: SHOP_KEY }],
            });
            expect({
                stateText: source.stateText,
                actions: source.actions.map(({ kind }) => kind),
                mail: templateRow(view, "Send Mail"),
            }).toEqual({
                stateText: "Templates disabled",
                actions: ["enableTemplates"],
                mail: { id: expect.any(String), state: "disabled", actions: [] },
            });
        });

        it("switches a marketplace registered for all projects in all projects", async () => {
            const { host, marketplaceCommands, addOns, view } = setUp({
                files: MARKETPLACE_FILES,
                settings: { marketplaces: [SHARED] },
            });
            await marketplaceCommands.update();
            view.attachTo(addOns);
            await shown(addOns);

            await view.connection!.handle({
                kind: "disableTemplates",
                sourceId: `marketplace:${JSON.stringify(SHARED)}`,
            });
            await shown(addOns);

            expect(host.templatePreferences.read()).toEqual({
                project: { disabled: [] },
                allProjects: { disabled: [{ source: `marketplace:local:${SHARED}` }] },
            });
            expect(marketplaceGroupOf(view)?.sources[0].actions.map(({ kind }) => kind)).toEqual([
                "removeMarketplace",
                "enableTemplates",
            ]);
            expect(templateRow(view, "Shared Mail").state).toBe("disabled");
        });

        it.each([
            {
                case: "a template the latest list no longer shows",
                request: { kind: "disable", addOnId: "template:gone" },
                reason: "unknownAddOn",
            },
            {
                case: "a source the latest list no longer shows",
                request: { kind: "enableTemplates", sourceId: "config:/gone" },
                reason: "unknownSource",
            },
        ] as const)("refuses to switch $case", async ({ request, reason }) => {
            const { host, addOns, view } = setUp({ files: MAIL_FILES });
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection!.handle(request);

            expect(result).toMatchObject({ kind: "refused", reason });
            expect(host.templatePreferences.read().project).toEqual({ disabled: [] });
        });

        it("stores a switch clicked twice once, and refuses it once the list shows it off", async () => {
            const { host, addOns, view } = setUp({ files: MAIL_FILES });
            view.attachTo(addOns);
            await shown(addOns);
            const { id } = templateRow(view, "Send Mail");

            const twice = await Promise.all([
                view.connection!.handle({ kind: "disable", addOnId: id }),
                view.connection!.handle({ kind: "disable", addOnId: id }),
            ]);
            await shown(addOns);
            const stale = await view.connection!.handle({ kind: "disable", addOnId: id });

            expect(twice.map(({ kind }) => kind)).toEqual(["done", "done"]);
            expect(host.templatePreferences.read().project).toEqual({
                disabled: [{ source: SHOP_KEY, templateId: "mail" }],
            });
            expect(stale).toMatchObject({ kind: "refused", reason: "notOffered" });
        });

        it("says a switch could not be saved, and logs why", async () => {
            const { host, addOns, view } = setUp({ files: MAIL_FILES });
            view.attachTo(addOns);
            await shown(addOns);
            vi.spyOn(host.templatePreferences, "change").mockRejectedValue(new Error("disk full"));

            const result = await view.connection!.handle({
                kind: "disable",
                addOnId: templateRow(view, "Send Mail").id,
            });

            expect(result).toEqual({
                kind: "failed",
                message: "Could not save this choice. The log says why.",
            });
            expect(host.notifier.loggedErrors.map(({ message }) => message)).toEqual(["disk full"]);
        });

        it("lists again when switches stored elsewhere reach the store", async () => {
            const { host, addOns, view } = setUp({ files: MAIL_FILES });
            view.attachTo(addOns);
            await shown(addOns);

            host.templatePreferences.storeElsewhere(
                "project",
                { disabled: [{ source: SHOP_KEY, templateId: "mail" }] },
                { notify: true },
            );
            await shown(addOns);

            expect(templateRow(view, "Send Mail").state).toBe("disabled");
        });

        it("reads the stored switches for each listing, as a mirror may not be seeded yet", async () => {
            const { host, addOns, view } = setUp({ files: MAIL_FILES });
            host.templatePreferences.storeElsewhere("project", {
                disabled: [{ source: SHOP_KEY }],
            });

            view.attachTo(addOns);
            await shown(addOns);

            expect(templateRow(view, "Send Mail").state).toBe("disabled");
        });

        it("offers no switch on a host that keeps none", async () => {
            const { addOns, view } = setUp({
                files: { ...RESIZE_FILES, ...MAIL_FILES },
                switches: false,
            });
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection!.handle({
                kind: "disable",
                addOnId: templateRow(view, "Send Mail").id,
            });

            expect(templateRow(view, "Send Mail").actions).toEqual([]);
            expect(view.latest().groups[0].sources[0].actions).toEqual([]);
            expect(result).toMatchObject({ kind: "refused" });
        });
    });

    describe("marketplaces", () => {
        it("lists a marketplace with its scope and templates", async () => {
            const { marketplaceCommands, addOns, view } = setUp({
                files: MARKETPLACE_FILES,
                settings: { marketplaces: [SHARED] },
            });
            await marketplaceCommands.update();

            view.attachTo(addOns);
            await shown(addOns);

            expect(
                marketplaceGroupOf(view)?.sources.map(
                    ({ label, description, problem, actions, addOns: rows }) => ({
                        label,
                        description,
                        problem,
                        actions: actions.map(({ kind }) => kind),
                        templates: rows.map(({ name }) => name),
                    }),
                ),
            ).toEqual([
                {
                    label: SHARED,
                    description: "All my projects",
                    problem: undefined,
                    actions: ["removeMarketplace", "disableTemplates"],
                    templates: ["Shared Mail"],
                },
            ]);
            expect(view.latest().actions.map(({ kind }) => kind)).toEqual([
                "addMarketplace",
                "updateMarketplaces",
                "pruneCache",
            ]);
        });

        it("still lists the folders' add-ons when the registrations cannot be read, and says why", async () => {
            const { host, addOns, view } = setUp();
            vi.spyOn(host.marketplaceRegistrations, "read").mockRejectedValue(
                new Error("host gone"),
            );

            view.attachTo(addOns);
            await shown(addOns);

            expect(
                view.models.at(-1)?.groups.map(({ id, problem, sources }) => ({
                    id,
                    problem,
                    sources: sources.length,
                })),
            ).toEqual([
                { id: "folder:/work", problem: undefined, sources: 1 },
                {
                    id: "marketplaces",
                    problem: "The registered marketplaces could not be read. The log says why.",
                    sources: 0,
                },
            ]);
            expect(host.notifier.loggedErrors.map(({ message }) => message)).toEqual(["host gone"]);
        });

        it("removing a marketplace runs the queued flow with its confirm", async () => {
            const { host, marketplaceCommands, addOns, view } = setUp({
                files: MARKETPLACE_FILES,
                settings: { marketplaces: [SHARED] },
                promptAnswers: { marketplaceRemovalConfirm: true },
            });
            await marketplaceCommands.update();
            view.attachTo(addOns);
            await shown(addOns);
            const [source] = marketplaceGroupOf(view)?.sources ?? [];

            const result = await view.connection!.handle({
                kind: "removeMarketplace",
                sourceId: source.id,
            });
            await shown(addOns);

            expect(result).toEqual({ kind: "reportedByFlow" });
            expect(host.picker.prompts.map(({ method }) => method)).toEqual(["confirm"]);
            expect(host.settings.values.marketplaces).toEqual([]);
            expect(host.notifier.infos).toContain("Removed 1 marketplace(s).");
            expect(marketplaceGroupOf(view)).toBeUndefined();
        });

        it.each([
            { removedRow: 0, kept: "https://github.com/acme/templates" },
            { removedRow: 1, kept: "acme/templates" },
        ])(
            "removes the entry of the row it was asked for when two entries share one cache slot",
            async ({ removedRow, kept }) => {
                const { host, addOns, view } = setUp({
                    settings: { marketplaces: ["acme/templates"] },
                    promptAnswers: { marketplaceRemovalConfirm: true },
                });
                await host.marketplaceRegistrations.register(
                    "https://github.com/acme/templates",
                    "project",
                );
                view.attachTo(addOns);
                await shown(addOns);
                const sources = marketplaceGroupOf(view)?.sources ?? [];

                await view.connection!.handle({
                    kind: "removeMarketplace",
                    sourceId: sources[removedRow].id,
                });

                expect(host.settings.values.marketplaces).toEqual([kept]);
            },
        );

        describe("beside the code actions", () => {
            /** The removal confirm stays open until the spec answers it. */
            function holdRemovalConfirm(host: ReturnType<typeof createTestHost>) {
                let asked = () => {};
                let answer: (value: boolean) => void = () => {};
                const confirmAsked = new Promise<void>((resolve) => (asked = resolve));
                vi.spyOn(host.picker, "confirm").mockImplementation(() => {
                    asked();
                    return new Promise<boolean>((resolve) => (answer = resolve));
                });
                return { confirmAsked, answer: (value: boolean) => answer(value) };
            }

            async function shownMarketplace(promptAnswers = {}) {
                const fixture = setUp({
                    files: MARKETPLACE_FILES,
                    settings: { marketplaces: [SHARED] },
                    promptAnswers,
                });
                fixture.view.attachTo(fixture.addOns);
                await shown(fixture.addOns);
                const [source] = marketplaceGroupOf(fixture.view)?.sources ?? [];
                return { ...fixture, sourceId: source.id };
            }

            it("a removal confirm left open holds back no code action", async () => {
                const { host, view, sourceId } = await shownMarketplace();
                const confirm = holdRemovalConfirm(host);
                const removing = view.connection!.handle({ kind: "removeMarketplace", sourceId });
                await confirm.confirmAsked;

                const pruned = await view.connection!.handle({ kind: "pruneCache" });
                confirm.answer(false);
                await removing;

                expect(pruned).toEqual({
                    kind: "done",
                    message: "No unused plugin copies to remove.",
                });
            });

            it("a code action still running holds back no marketplace flow", async () => {
                const { host, plugins, view, sourceId } = await shownMarketplace({
                    marketplaceRemovalConfirm: true,
                });
                let finishPrune = () => {};
                vi.spyOn(plugins.inventory, "pruneCache").mockImplementation(
                    () => new Promise((resolve) => (finishPrune = () => resolve({ removed: 0 }))),
                );
                const pruning = view.connection!.handle({ kind: "pruneCache" });

                const removed = await view.connection!.handle({
                    kind: "removeMarketplace",
                    sourceId,
                });
                finishPrune();
                await pruning;

                expect(removed).toEqual({ kind: "reportedByFlow" });
                expect(host.settings.values.marketplaces).toEqual([]);
            });

            it("is not settled while a marketplace flow still asks", async () => {
                const { host, addOns, view, sourceId } = await shownMarketplace();
                const confirm = holdRemovalConfirm(host);
                const removing = view.connection!.handle({ kind: "removeMarketplace", sourceId });
                await confirm.confirmAsked;
                let settled = false;
                void addOns.whenSettled().then(() => (settled = true));

                await new Promise((resolve) => setTimeout(resolve, 0));
                const settledWhileAsking = settled;
                confirm.answer(false);
                await removing;
                await addOns.whenSettled();

                expect([settledWhileAsking, settled]).toEqual([false, true]);
            });
        });

        it("removes nothing when its confirm is declined", async () => {
            const { host, addOns, view } = setUp({
                files: MARKETPLACE_FILES,
                settings: { marketplaces: [SHARED] },
            });
            view.attachTo(addOns);
            await shown(addOns);
            const [source] = marketplaceGroupOf(view)?.sources ?? [];

            await view.connection!.handle({ kind: "removeMarketplace", sourceId: source.id });

            expect(host.settings.values.marketplaces).toEqual([SHARED]);
        });

        it("refuses to remove a marketplace the latest list no longer shows", async () => {
            const { host, addOns, view } = setUp({ files: MARKETPLACE_FILES });
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection!.handle({
                kind: "removeMarketplace",
                sourceId: "marketplace:gone",
            });

            expect(result).toMatchObject({ kind: "refused", reason: "unknownSource" });
            expect(host.picker.prompts).toEqual([]);
        });

        it("adds and updates marketplaces through the commands' flows", async () => {
            const { host, addOns, view } = setUp({
                files: MARKETPLACE_FILES,
                marketplaceAnswers: [{ location: LOCAL, scope: "project" }],
            });
            view.attachTo(addOns);
            await shown(addOns);

            const results = [
                await view.connection!.handle({ kind: "addMarketplace" }),
                await view.connection!.handle({ kind: "updateMarketplaces" }),
            ];
            await shown(addOns);

            expect(results).toEqual([{ kind: "reportedByFlow" }, { kind: "reportedByFlow" }]);
            expect(host.notifier.infos).toEqual([
                "Marketplace added.",
                "Updated 1 marketplace(s).",
            ]);
            expect(
                marketplaceGroupOf(view)?.sources.map(({ label, description }) => [
                    label,
                    description,
                ]),
            ).toEqual([[LOCAL, "This project"]]);
        });

        it("refuses a marketplace action on a host that lists no marketplaces", async () => {
            const { addOns, view } = setUp({ marketplaces: false });
            view.attachTo(addOns);
            await shown(addOns);

            const result = await view.connection!.handle({ kind: "addMarketplace" });

            expect(result).toMatchObject({ kind: "refused", reason: "notOffered" });
            expect(view.latest().actions.map(({ kind }) => kind)).toEqual(["pruneCache"]);
        });

        it("a marketplace change reaches every visible view", async () => {
            const { marketplaceCommands, addOns } = setUp({
                files: MARKETPLACE_FILES,
                marketplaceAnswers: [{ location: SHARED, scope: "allProjects" }],
            });
            const first = new RecordingAddOnView();
            const second = new RecordingAddOnView();
            first.attachTo(addOns);
            second.attachTo(addOns);
            await shown(addOns);

            await marketplaceCommands.add();
            await shown(addOns);

            expect(
                [first, second].map((each) =>
                    marketplaceGroupOf(each)?.sources.flatMap(({ addOns: rows }) =>
                        rows.map(({ name }) => name),
                    ),
                ),
            ).toEqual([["Shared Mail"], ["Shared Mail"]]);
        });

        it("lists again once the marketplaces setting changes", async () => {
            const { host, settingChanges, addOns, view } = setUp({ files: MARKETPLACE_FILES });
            view.attachTo(addOns);
            await shown(addOns);

            await host.marketplaceRegistrations.register(SHARED, "project");
            settingChanges.fire(settingChangeNaming(["marketplaces"]));
            await shown(addOns);

            expect(marketplaceGroupOf(view)?.sources.map(({ label }) => label)).toEqual([SHARED]);
        });
    });

    it("Review… on a notice lands on the plugin's row, not allowed yet, and no notice asks again", async () => {
        const { host, plugins, addOns } = setUp();
        const panel: Query[] = [];
        addOns.attachPanel((message) => panel.push(message), true);
        await shown(addOns);
        const question = new ApprovalQuestion(
            plugins.catalog,
            new ViewReview(
                "plugin",
                {
                    reveal: async (addOnIds) => {
                        addOns.reveal(addOnIds);
                        return true;
                    },
                },
                new ListReview(host.picker),
            ),
            host.actionNotifier,
            host.workspace,
            new QuestionQueue(),
        );
        host.actionNotifier.noticeAnswers[PLUGIN_APPROVAL_NOTICE_ID] = "review";
        const { pending } = await plugins.catalog.pluginsFor("/work/order.bpmn");

        await question.ask(pending);
        await shown(addOns);
        await question.ask(pending);

        const reveals = panel.flatMap((each) =>
            each instanceof RevealAddOnsQuery && each.reveal.kind === "rows"
                ? [each.reveal.addOnIds]
                : [],
        );
        const latest = panel.filter((each) => each instanceof AddOnCatalogQuery).at(-1);
        const row = latest?.model.groups[0].sources[0].addOns[0];
        expect(reveals).toEqual([[`plugin:${RESIZE}`]]);
        expect([row?.id, row?.stateText]).toEqual([`plugin:${RESIZE}`, "Not allowed yet"]);
        expect(host.picker.prompts).toEqual([]);
        expect(host.actionNotifier.notices.map(({ id }) => id)).toEqual([
            PLUGIN_APPROVAL_NOTICE_ID,
        ]);
    });
});
