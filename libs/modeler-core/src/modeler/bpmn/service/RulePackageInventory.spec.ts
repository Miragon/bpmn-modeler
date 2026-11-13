import { describe, expect, it } from "vitest";

import { LOCAL_HOST } from "../../../kernel/domain/allowance";
import { AllowanceLocator } from "../../../kernel/service/AllowanceLocator";
import { createTestHost, InMemoryInstalledPackages, writeRepository } from "../../../testing";
import { BlockedRulePackage } from "../domain/rulePackageApproval";
import { RulePackageCatalog } from "./RulePackageCatalog";
import { RulePackageInventory } from "./RulePackageInventory";

const WORK = "/work";
const NODE_MODULES = `${WORK}/node_modules`;
const ACME = `${NODE_MODULES}/bpmnlint-plugin-acme`;
const SCOPED = `${NODE_MODULES}/@acme/bpmnlint-plugin-rules`;
const STORE = "/store/bpmnlint-plugin-linked";
const LINKED = `${NODE_MODULES}/bpmnlint-plugin-linked`;

function setUp() {
    const host = createTestHost({ folders: [WORK] });
    const disk = new InMemoryInstalledPackages();
    writeRepository(disk, WORK);
    const allowances = new AllowanceLocator(disk, LOCAL_HOST);
    const install = (dir: string, name: string, version = "1.2.0") => {
        disk.writeFile(`${dir}/package.json`, JSON.stringify({ name, version }));
        disk.writeFile(`${dir}/index.js`, `module.exports = "${name}";`);
    };
    const catalog = new RulePackageCatalog(
        host.pluginApprovals,
        host.workspaceTrust,
        host.notifier,
    );
    const inventory = new RulePackageInventory(catalog, disk, allowances);
    const allowanceAt = (id: string) => allowances.allowanceAt("rulePackage", id);
    return { host, disk, install, catalog, inventory, allowanceAt };
}

const blocked = (
    id: string,
    kind: BlockedRulePackage["kind"] = "package",
    state: BlockedRulePackage["state"] = "new",
): BlockedRulePackage => ({
    id,
    name: id,
    version: "1.2.0",
    allowance: { kind: "rulePackage", host: "", origin: { kind: "folder", path: id }, addOn: "" },
    kind,
    state,
    needed: true,
});

describe("RulePackageInventory", () => {
    it("finds the rule packages installed in node_modules by their real folder", () => {
        const { disk, install, inventory } = setUp();
        install(ACME, "bpmnlint-plugin-acme");
        install(SCOPED, "@acme/bpmnlint-plugin-rules");
        install(STORE, "bpmnlint-plugin-linked");
        disk.createSymbolicLink(LINKED, STORE);
        install(`${NODE_MODULES}/lodash`, "lodash");

        expect(inventory.installedIn([WORK, "/elsewhere"])).toEqual([SCOPED, ACME, STORE]);
    });

    it("reads a package by its name@version and its allowance", () => {
        const { install, inventory, allowanceAt } = setUp();
        install(ACME, "bpmnlint-plugin-acme");

        expect(inventory.currentRulePackage(ACME)).toEqual({
            kind: "found",
            artifact: {
                id: ACME,
                name: "bpmnlint-plugin-acme",
                version: "1.2.0",
                allowance: allowanceAt(ACME),
            },
            name: "bpmnlint-plugin-acme@1.2.0",
        });
        expect(allowanceAt(ACME)).toEqual({
            kind: "rulePackage",
            host: LOCAL_HOST,
            origin: { kind: "repository", path: `${WORK}/.git` },
            addOn: "node_modules/bpmnlint-plugin-acme",
        });
    });

    it("names a package without a manifest by its folder", () => {
        const { disk, inventory } = setUp();
        disk.writeFile(`${ACME}/index.js`, "module.exports = {};");

        const presence = inventory.currentRulePackage(ACME);

        expect(presence.kind === "found" && presence.artifact).toMatchObject({
            name: "bpmnlint-plugin-acme",
            version: "",
        });
        expect(presence.name).toBe("bpmnlint-plugin-acme");
    });

    it("reads the config's own package as the gate reported it", () => {
        const { install, inventory } = setUp();
        install(WORK, "bpmnlint-plugin-self");
        inventory.noteSeen([blocked(WORK, "selfPackage")]);

        expect(inventory.currentRulePackage(WORK).kind).toBe("found");
    });

    it("reads a config's own package once a lint read its config", () => {
        const { disk, install, inventory } = setUp();
        install(STORE, "bpmnlint-plugin-self");
        disk.createSymbolicLink(`${WORK}/linked-config`, STORE);
        inventory.noteLintConfig(`${WORK}/linked-config/.bpmnlintrc`);

        expect(inventory.currentRulePackage(STORE).kind).toBe("found");
    });

    it("reads a package linked into node_modules from outside it as a package", () => {
        const { disk, install, inventory } = setUp();
        install("/work/packages/rules", "bpmnlint-plugin-rules");
        disk.createSymbolicLink(`${NODE_MODULES}/bpmnlint-plugin-rules`, "/work/packages/rules");
        inventory.installedIn([WORK]);

        expect(inventory.currentRulePackage("/work/packages/rules").kind).toBe("found");
    });

    it("no longer reads a folder as a package once the listing finds its link removed", () => {
        const { disk, install, inventory } = setUp();
        install("/work/packages/rules", "bpmnlint-plugin-rules");
        disk.createSymbolicLink(`${NODE_MODULES}/bpmnlint-plugin-rules`, "/work/packages/rules");
        inventory.installedIn([WORK]);
        disk.remove(`${NODE_MODULES}/bpmnlint-plugin-rules`);

        expect(inventory.installedIn([WORK])).toEqual([]);
        expect(inventory.currentRulePackage("/work/packages/rules").kind).toBe("unreadable");
    });

    it("cannot allow a linked folder that holds a lint config, as the gate refuses it, and names its allowance", () => {
        const { disk, install, inventory, allowanceAt } = setUp();
        install("/repo", "bpmnlint-plugin-repo");
        disk.createSymbolicLink(`${NODE_MODULES}/bpmnlint-plugin-repo`, "/repo");
        inventory.installedIn([WORK]);
        inventory.noteLintConfig("/repo/modeling/.bpmnlintrc");

        expect(inventory.currentRulePackage("/repo")).toEqual({
            kind: "unreadable",
            id: "/repo",
            name: "repo",
            reason: "the package link it comes through points to a folder that holds the config",
            allowance: allowanceAt("/repo"),
        });
    });

    it("cannot allow a folder outside node_modules that no lint reported or read yet", () => {
        const { install, inventory, allowanceAt } = setUp();
        install(WORK, "bpmnlint-plugin-self");

        expect(inventory.currentRulePackage(WORK)).toEqual({
            kind: "unreadable",
            id: WORK,
            name: "work",
            reason: "lint a diagram that uses it first",
            allowance: allowanceAt(WORK),
        });
    });

    it("reads a package as gone once its folder is", () => {
        const { inventory } = setUp();

        expect(inventory.currentRulePackage(ACME)).toEqual({
            kind: "gone",
            id: ACME,
            name: "bpmnlint-plugin-acme",
        });
    });

    it("reads a package again for an allow", async () => {
        const { install, inventory } = setUp();
        install(ACME, "bpmnlint-plugin-acme");

        expect(await inventory.current(ACME)).toEqual(inventory.currentRulePackage(ACME));
    });

    it("remembers every package it saw blocked, the ones the bundle stood in for too", () => {
        const { inventory } = setUp();

        inventory.noteSeen([{ ...blocked(ACME, "selfPackage"), needed: false }]);
        inventory.noteSeen([blocked(SCOPED), blocked(ACME, "package", "declined")]);

        expect(inventory.seenPackages()).toEqual([
            blocked(ACME, "package", "declined"),
            blocked(SCOPED),
        ]);
    });

    it("knows the packages the gate reported and the lint configs it read", () => {
        const { inventory } = setUp();

        inventory.noteSeen([blocked(ACME), blocked(SCOPED)]);
        inventory.noteLintConfig("/work/orders/.bpmnlintrc");
        inventory.noteLintConfig("/work/orders/.bpmnlintrc");

        expect(inventory.seenPackageIds()).toEqual([ACME, SCOPED]);
        expect(inventory.lintConfigDirs()).toEqual(["/work/orders"]);
    });

    it("announces an answer, a package the gate reports anew, a package left to the view and a lint config read anew", async () => {
        const { catalog, inventory, allowanceAt } = setUp();
        let changes = 0;
        inventory.onDidChange(() => changes++);

        inventory.noteSeen([blocked(ACME)]);
        inventory.noteSeen([blocked(ACME)]);
        await catalog.applyAnswer(catalog.stillPendingOf([blocked(ACME)]), {
            kind: "checked",
            ids: [],
        });
        inventory.noteSeen([blocked(ACME, "package", "declined")]);
        inventory.leaveForView({ id: ACME, allowance: allowanceAt(ACME) });
        inventory.noteLintConfig("/work/orders/.bpmnlintrc");
        inventory.noteLintConfig("/work/orders/.bpmnlintrc");

        expect(changes).toBe(5);
    });

    it("announces nothing once its listener is disposed, neither a listing change nor an answer", async () => {
        const { catalog, inventory, allowanceAt } = setUp();
        let changes = 0;
        inventory.onDidChange(() => changes++).dispose();

        inventory.noteSeen([blocked(ACME)]);
        inventory.noteLintConfig("/work/orders/.bpmnlintrc");
        await catalog.applyAnswer(catalog.stillPendingOf([blocked(ACME)]), {
            kind: "checked",
            ids: [],
        });
        inventory.leaveForView({ id: SCOPED, allowance: allowanceAt(SCOPED) });

        expect(changes).toBe(0);
    });

    it.each([
        { id: ACME, dir: NODE_MODULES },
        { id: "/work/packages/rules", dir: "/work/packages/rules" },
    ])("lists $id under $dir", ({ id, dir }) => {
        expect(setUp().inventory.sourceDirOf(id)).toBe(dir);
    });

    it("asks no notice about a package left to the view", () => {
        const { catalog, inventory } = setUp();
        const acme = blocked(ACME);

        inventory.leaveForView(acme);

        expect(catalog.stillPendingOf([acme])).toEqual([]);
        expect([...inventory.sessionAnswers().values()]).toEqual(["leftForView"]);
    });
});
