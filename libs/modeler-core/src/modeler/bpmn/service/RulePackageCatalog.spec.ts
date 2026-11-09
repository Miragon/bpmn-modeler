import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
    codeApprovalChange,
    declineKeyOf,
    type FollowedApprovalChange,
} from "../../../kernel/domain/codeApproval";
import { createTestHost, InMemoryInstalledPackages } from "../../../testing";
import { BlockedRulePackage } from "../domain/rulePackageApproval";
import { PackageClosureFingerprinter } from "./PackageClosureFingerprinter";
import { RulePackageCatalog } from "./RulePackageCatalog";

const ACME = "/work/node_modules/bpmnlint-plugin-acme";
const OTHER = "/work/node_modules/bpmnlint-plugin-other";
const WORK = "/work";

const blocked = (
    id: string,
    needed: boolean,
    state: BlockedRulePackage["state"] = "new",
    kind: BlockedRulePackage["kind"] = "package",
): BlockedRulePackage => ({ id, kind, state, needed });

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
    install(ACME, "bpmnlint-plugin-acme");
    install(OTHER, "bpmnlint-plugin-other");
    const fingerprinter = new PackageClosureFingerprinter(disk);
    const catalog = new RulePackageCatalog(host.pluginApprovals, fingerprinter, host.notifier);
    const contentHashOf = (id: string, kind: BlockedRulePackage["kind"] = "package") => {
        const fingerprint = fingerprinter.fingerprint({ kind, id });
        if (fingerprint.kind !== "fingerprinted") {
            throw new Error(`refused: ${fingerprint.reason}`);
        }
        return fingerprint.rulePackage.contentHash;
    };
    return { host, disk, install, catalog, contentHashOf };
}

describe("RulePackageCatalog", () => {
    it("asks about the packages whose rules were skipped, named by their manifest", () => {
        const { catalog, contentHashOf } = setUp();

        const pending = catalog.stillPendingOf([blocked(ACME, true), blocked(OTHER, false)]);

        expect(pending).toEqual([
            {
                artifact: {
                    id: ACME,
                    name: "bpmnlint-plugin-acme",
                    version: "1.2.0",
                    contentHash: contentHashOf(ACME),
                },
                state: "new",
            },
        ]);
    });

    it("hashes the config's own package without its models, as the gate does", () => {
        const { install, catalog, contentHashOf } = setUp();
        install(WORK, "bpmnlint-plugin-self", { "order.bpmn": "<definitions/>" });

        const [pending] = catalog.stillPendingOf([blocked(WORK, true, "new", "selfPackage")]);

        expect(pending.artifact.contentHash).toBe(contentHashOf(WORK, "selfPackage"));
        expect(pending.artifact.contentHash).not.toBe(contentHashOf(WORK, "package"));
    });

    it("keeps a checked package allowed with its content hash, beside the other approval kinds", async () => {
        const { host, catalog, contentHashOf } = setUp();
        const pluginRow = { pluginId: "/work/.camunda/plugins/resize", contentHash: "h1" };
        host.pluginApprovals.approvals = [pluginRow];
        const pending = catalog.stillPendingOf([blocked(ACME, true), blocked(OTHER, true)]);

        const allowed = await catalog.applyAnswer(pending, { kind: "checked", ids: [ACME] });

        expect(allowed.map(({ id }) => id)).toEqual([ACME]);
        expect(host.pluginApprovals.approvals).toEqual([
            pluginRow,
            { pluginId: ACME, contentHash: contentHashOf(ACME) },
        ]);
        expect(host.notifier.logged("info")).toEqual([
            "Allowed bpmnlint rule package(s): bpmnlint-plugin-acme",
        ]);
        expect(catalog.stillPendingOf([blocked(ACME, true)])).toEqual([]);
    });

    it("declines the unchecked packages for this session and tells the gate so", async () => {
        const { catalog, contentHashOf } = setUp();
        const pending = catalog.stillPendingOf([blocked(ACME, true), blocked(OTHER, true)]);

        await catalog.applyAnswer(pending, { kind: "checked", ids: [ACME] });

        expect([...catalog.declinedThisSession()]).toEqual([
            declineKeyOf({ id: OTHER, name: OTHER, contentHash: contentHashOf(OTHER) }),
        ]);
        expect(catalog.stillPendingOf([blocked(OTHER, true)])).toEqual([]);
    });

    it("leaves packages to the view without declining them, and asks no notice about them again", async () => {
        const { host, catalog } = setUp();
        const pending = catalog.stillPendingOf([blocked(ACME, true), blocked(OTHER, true)]);

        const allowed = await catalog.applyAnswer(pending, { kind: "leftForView" });

        expect(allowed).toEqual([]);
        expect(host.pluginApprovals.approvals).toEqual([]);
        expect([...catalog.declinedThisSession()]).toEqual([]);
        expect(catalog.stillPendingOf([blocked(ACME, true), blocked(OTHER, true)])).toEqual([]);
    });

    it("writes nothing and logs nothing when the answer allowed no package", async () => {
        const { host, catalog } = setUp();

        await catalog.applyAnswer(catalog.stillPendingOf([blocked(ACME, true)]), {
            kind: "checked",
            ids: [],
        });

        expect(host.pluginApprovals.approvals).toEqual([]);
        expect(host.notifier.logged("info")).toEqual([]);
    });

    it("asks again about a declined package once its content changed", async () => {
        const { disk, catalog } = setUp();
        await catalog.applyAnswer(catalog.stillPendingOf([blocked(ACME, true)]), {
            kind: "checked",
            ids: [],
        });

        disk.writeFile(`${ACME}/index.js`, "module.exports = 'changed';");

        expect(catalog.stillPendingOf([blocked(ACME, true)]).map(({ state }) => state)).toEqual([
            "new",
        ]);
    });

    it("asks about a package changed since it was allowed as changed", () => {
        const { host, catalog } = setUp();
        host.pluginApprovals.approvals = [
            { pluginId: ACME, contentHash: "bpmnlint-closure-v1:old" },
        ];

        const pending = catalog.stillPendingOf([blocked(ACME, true, "changed")]);

        expect(pending.map(({ state }) => state)).toEqual(["changed"]);
    });

    it("never offers a package it cannot fingerprint, and logs why once", () => {
        const { host, disk, catalog } = setUp();
        disk.createSymbolicLink(`${ACME}/escape.js`, "/etc/passwd");

        const first = catalog.stillPendingOf([blocked(ACME, true)]);
        const second = catalog.stillPendingOf([blocked(ACME, true)]);

        expect([first, second]).toEqual([[], []]);
        expect(host.notifier.logged("warning")).toEqual([
            `bpmnlint: rule package ${ACME} cannot be allowed: it links to files outside its folder.`,
        ]);
    });

    it("announces each change of the rule package rows, whoever made it", () => {
        const { host, catalog } = setUp();
        const acme = { pluginId: ACME, contentHash: "bpmnlint-closure-v1:a1" };
        const other = { pluginId: OTHER, contentHash: "bpmnlint-closure-v1:o1" };
        host.pluginApprovals.storeElsewhere([acme], { notify: true });
        const changes: FollowedApprovalChange[] = [];
        catalog.onApprovalsChanged((followed) => changes.push(followed));

        host.pluginApprovals.storeElsewhere([other], { notify: true });
        host.pluginApprovals.storeElsewhere(
            [other, { pluginId: "/work/.camunda/plugins/resize", contentHash: "h1" }],
            { notify: true },
        );

        expect(changes).toEqual([
            { change: codeApprovalChange([other], [ACME]), withdrawn: [ACME] },
        ]);
    });

    it("announces a package allowed at another content as withdrawn", () => {
        const { host, catalog } = setUp();
        const acme = { pluginId: ACME, contentHash: "bpmnlint-closure-v1:a1" };
        host.pluginApprovals.storeElsewhere([acme], { notify: true });
        const changes: FollowedApprovalChange[] = [];
        catalog.onApprovalsChanged((followed) => changes.push(followed));

        const rehashed = { ...acme, contentHash: "bpmnlint-closure-v1:a2" };
        host.pluginApprovals.storeElsewhere([rehashed], { notify: true });

        expect(changes).toEqual([
            { change: codeApprovalChange([rehashed], []), withdrawn: [ACME] },
        ]);
    });

    it("remembers the packages revoked this session, since code they ran stays loaded", () => {
        const { host, catalog } = setUp();
        host.pluginApprovals.storeElsewhere(
            [
                { pluginId: ACME, contentHash: "bpmnlint-closure-v1:a1" },
                { pluginId: OTHER, contentHash: "bpmnlint-closure-v1:o1" },
            ],
            { notify: true },
        );

        host.pluginApprovals.storeElsewhere(
            [{ pluginId: OTHER, contentHash: "bpmnlint-closure-v1:o1" }],
            { notify: true },
        );

        expect(catalog.revokedThisSession()).toEqual(new Set([ACME]));
    });

    it("follows no approval change once disposed", () => {
        const { host, catalog } = setUp();
        const changes: FollowedApprovalChange[] = [];
        catalog.onApprovalsChanged((followed) => changes.push(followed));

        catalog.dispose();
        host.pluginApprovals.storeElsewhere(
            [{ pluginId: ACME, contentHash: "bpmnlint-closure-v1:a1" }],
            { notify: true },
        );

        expect(changes).toEqual([]);
    });

    it("remembers every package it saw blocked, the ones the bundle stood in for too", () => {
        const { catalog } = setUp();

        catalog.noteSeen([blocked(ACME, false)]);
        catalog.noteSeen([blocked(OTHER, true), blocked(ACME, true, "declined")]);

        expect(catalog.seenPackages()).toEqual([
            blocked(ACME, true, "declined"),
            blocked(OTHER, true),
        ]);
    });
});
