import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createTestHost, InMemoryInstalledPackages } from "../../../testing";
import { BlockedRulePackage } from "../domain/rulePackageApproval";
import { PackageClosureFingerprinter } from "./PackageClosureFingerprinter";
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
    const disk = new InMemoryInstalledPackages((bytes) =>
        createHash("sha256").update(bytes).digest("hex"),
    );
    const install = (dir: string, name: string, files: Record<string, string> = {}) => {
        disk.writeFile(`${dir}/package.json`, JSON.stringify({ name, version: "1.2.0" }));
        disk.writeFile(`${dir}/index.js`, `module.exports = "${name}";`);
        Object.entries(files).forEach(([relPath, content]) =>
            disk.writeFile(`${dir}/${relPath}`, content),
        );
    };
    const fingerprinter = new PackageClosureFingerprinter(disk);
    const catalog = new RulePackageCatalog(host.pluginApprovals, fingerprinter, host.notifier);
    const inventory = new RulePackageInventory(catalog, fingerprinter, disk);
    const contentHashOf = (id: string, kind: BlockedRulePackage["kind"] = "package") => {
        const fingerprint = fingerprinter.fingerprint({ kind, id });
        if (fingerprint.kind !== "fingerprinted") throw new Error(fingerprint.reason);
        return fingerprint.rulePackage.contentHash;
    };
    return { host, disk, install, catalog, inventory, contentHashOf };
}

const blocked = (
    id: string,
    kind: BlockedRulePackage["kind"] = "package",
    state: BlockedRulePackage["state"] = "new",
): BlockedRulePackage => ({ id, kind, state, needed: true });

describe("RulePackageInventory", () => {
    it("finds the rule packages installed in node_modules by their real folder", () => {
        const { disk, install, inventory } = setUp();
        install(ACME, "bpmnlint-plugin-acme");
        install(SCOPED, "@acme/bpmnlint-plugin-rules");
        install(STORE, "bpmnlint-plugin-linked");
        disk.createSymbolicLink(LINKED, STORE);
        install(`${NODE_MODULES}/lodash`, "lodash");

        expect(inventory.installedIn([NODE_MODULES, "/elsewhere/node_modules"])).toEqual([
            SCOPED,
            ACME,
            STORE,
        ]);
    });

    it("reads a package without hashing it until asked to", () => {
        const { disk, install, inventory } = setUp();
        install(ACME, "bpmnlint-plugin-acme");

        const presence = inventory.currentRulePackage(ACME, { hash: false });

        expect(presence).toEqual({ kind: "unhashed", id: ACME, name: "bpmnlint-plugin-acme" });
        expect(disk.filesHashed).toEqual([]);
    });

    it("hashes a package with its closure when asked to", () => {
        const { install, inventory, contentHashOf } = setUp();
        install(ACME, "bpmnlint-plugin-acme");

        expect(inventory.currentRulePackage(ACME, { hash: true })).toEqual({
            kind: "found",
            artifact: {
                id: ACME,
                name: "bpmnlint-plugin-acme",
                version: "1.2.0",
                contentHash: contentHashOf(ACME),
                files: [ACME],
            },
            name: "bpmnlint-plugin-acme",
        });
    });

    it("hashes the config's own package as the gate reported it", () => {
        const { install, catalog, inventory, contentHashOf } = setUp();
        install(WORK, "bpmnlint-plugin-self", { "order.bpmn": "<definitions/>" });
        catalog.noteSeen([blocked(WORK, "selfPackage")]);

        const presence = inventory.currentRulePackage(WORK, { hash: true });

        expect(presence.kind === "found" && presence.artifact.contentHash).toBe(
            contentHashOf(WORK, "selfPackage"),
        );
    });

    it("hashes an allowed config's own package as the gate does, once a lint read its config", () => {
        const { host, disk, install, catalog, inventory, contentHashOf } = setUp();
        install(STORE, "bpmnlint-plugin-self", { "order.bpmn": "<definitions/>" });
        disk.createSymbolicLink(WORK, STORE);
        host.pluginApprovals.approvals = [
            { pluginId: STORE, contentHash: contentHashOf(STORE, "selfPackage") },
        ];
        catalog.noteLintConfig(`${WORK}/.bpmnlintrc`);

        const presence = inventory.currentRulePackage(STORE, { hash: true });

        expect(presence.kind === "found" && presence.artifact.contentHash).toBe(
            contentHashOf(STORE, "selfPackage"),
        );
    });

    it("hashes a package linked into node_modules from outside it as a package", () => {
        const { disk, install, inventory, contentHashOf } = setUp();
        install("/work/packages/rules", "bpmnlint-plugin-rules", { "order.bpmn": "<x/>" });
        disk.createSymbolicLink(`${NODE_MODULES}/bpmnlint-plugin-rules`, "/work/packages/rules");
        inventory.installedIn([NODE_MODULES]);

        const presence = inventory.currentRulePackage("/work/packages/rules", { hash: true });

        expect(presence.kind === "found" && presence.artifact.contentHash).toBe(
            contentHashOf("/work/packages/rules"),
        );
    });

    it("cannot allow a folder outside node_modules that no lint reported or read yet", () => {
        const { install, inventory, disk } = setUp();
        install(WORK, "bpmnlint-plugin-self", { "order.bpmn": "<definitions/>" });

        expect(inventory.currentRulePackage(WORK, { hash: true })).toEqual({
            kind: "unreadable",
            id: WORK,
            name: "work",
            reason: "lint a diagram that uses it first",
        });
        expect(disk.filesHashed).toEqual([]);
    });

    it.each([
        { case: "gone once its folder is", hash: true },
        { case: "gone without a hash too", hash: false },
    ])("reads a package as $case", ({ hash }) => {
        const { inventory } = setUp();

        expect(inventory.currentRulePackage(ACME, { hash })).toEqual({
            kind: "gone",
            id: ACME,
            name: "bpmnlint-plugin-acme",
        });
    });

    it("reads a package it cannot fingerprint as unreadable, with the reason", () => {
        const { disk, install, inventory } = setUp();
        install(ACME, "bpmnlint-plugin-acme");
        disk.createSymbolicLink(`${ACME}/escape.js`, "/etc/passwd");

        expect(inventory.currentRulePackage(ACME, { hash: true })).toEqual({
            kind: "unreadable",
            id: ACME,
            name: "bpmnlint-plugin-acme",
            reason: "it links to files outside its folder",
        });
    });

    it("knows the packages the gate reported and the lint configs it read", () => {
        const { catalog, inventory } = setUp();

        catalog.noteSeen([blocked(ACME), blocked(SCOPED)]);
        catalog.noteLintConfig("/work/orders/.bpmnlintrc");
        catalog.noteLintConfig("/work/orders/.bpmnlintrc");

        expect(inventory.seenPackageIds()).toEqual([ACME, SCOPED]);
        expect(inventory.lintConfigDirs()).toEqual(["/work/orders"]);
    });

    it("announces an answer, a package the gate reports anew, content left to the view and a lint config read anew", async () => {
        const { install, catalog, inventory, contentHashOf } = setUp();
        install(ACME, "bpmnlint-plugin-acme");
        let changes = 0;
        inventory.onDidChange(() => changes++);

        catalog.noteSeen([blocked(ACME)]);
        catalog.noteSeen([blocked(ACME)]);
        await catalog.applyAnswer(catalog.stillPendingOf([blocked(ACME)]), {
            kind: "checked",
            ids: [],
        });
        catalog.noteSeen([blocked(ACME, "package", "declined")]);
        inventory.leaveForView({ id: ACME, name: "acme", contentHash: contentHashOf(ACME) });
        catalog.noteLintConfig("/work/orders/.bpmnlintrc");
        catalog.noteLintConfig("/work/orders/.bpmnlintrc");

        expect(changes).toBe(5);
    });

    it("owns the rule package rows of the shared approval list", () => {
        const { inventory } = setUp();

        expect(
            ["bpmnlint-closure-v1:abc", "a".repeat(64)].map((contentHash) =>
                inventory.ownsApproval({ pluginId: ACME, contentHash }),
            ),
        ).toEqual([true, false]);
    });

    it("asks no notice about a package left to the view", () => {
        const { install, catalog, inventory, contentHashOf } = setUp();
        install(ACME, "bpmnlint-plugin-acme");

        inventory.leaveForView({ id: ACME, name: "acme", contentHash: contentHashOf(ACME) });

        expect(catalog.stillPendingOf([blocked(ACME)])).toEqual([]);
        expect([...inventory.sessionAnswers().values()]).toEqual(["leftForView"]);
    });
});
