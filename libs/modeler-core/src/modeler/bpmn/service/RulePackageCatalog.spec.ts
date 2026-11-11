import { describe, expect, it } from "vitest";

import { Allowance, allowanceKeyOf, allowanceRowOf } from "../../../kernel/domain/allowance";
import { RULE_PACKAGE_CONTENT_HASH_PREFIX } from "../../../kernel/domain/approvalRowKind";
import { codeApprovalChange, type CodeApprovalChange } from "../../../kernel/domain/codeApproval";
import { createTestHost } from "../../../testing";
import { BlockedRulePackage } from "../domain/rulePackageApproval";
import { RulePackageCatalog } from "./RulePackageCatalog";

const WORK = "/work";
const ACME = `${WORK}/node_modules/bpmnlint-plugin-acme`;
const NESTED_ACME = `${WORK}/node_modules/x/node_modules/bpmnlint-plugin-acme`;
const OTHER = `${WORK}/node_modules/bpmnlint-plugin-other`;

const allowanceOfAddOn = (addOn: string): Allowance => ({
    kind: "rulePackage",
    host: "",
    origin: { kind: "repository", path: `${WORK}/.git` },
    addOn,
});
const ACME_ALLOWANCE = allowanceOfAddOn("node_modules/bpmnlint-plugin-acme");
const OTHER_ALLOWANCE = allowanceOfAddOn("node_modules/bpmnlint-plugin-other");

const blocked = (
    id: string,
    needed: boolean,
    state: BlockedRulePackage["state"] = "new",
    allowance = id === OTHER ? OTHER_ALLOWANCE : ACME_ALLOWANCE,
): BlockedRulePackage => ({
    id,
    name: id === OTHER ? "bpmnlint-plugin-other" : "bpmnlint-plugin-acme",
    version: "1.2.0",
    allowance,
    kind: "package",
    state,
    needed,
});

function setUp() {
    const host = createTestHost({ folders: [WORK] });
    const catalog = new RulePackageCatalog(
        host.pluginApprovals,
        host.workspaceTrust,
        host.notifier,
    );
    return { host, catalog };
}

describe("RulePackageCatalog", () => {
    it("asks about the packages whose rules were skipped, as the gate reported them", () => {
        const { catalog } = setUp();

        const pending = catalog.stillPendingOf([blocked(ACME, true), blocked(OTHER, false)]);

        expect(pending).toEqual([blocked(ACME, true)]);
    });

    it("asks about no package in a workspace the user did not trust", () => {
        const { host, catalog } = setUp();
        host.workspaceTrust.setTrusted(false);

        expect(catalog.stillPendingOf([blocked(ACME, true)])).toEqual([]);
    });

    it("asks once about a hoisted and a nested copy of one allowance", () => {
        const { catalog } = setUp();

        const pending = catalog.stillPendingOf([blocked(ACME, true), blocked(NESTED_ACME, true)]);

        expect(pending.map(({ id }) => id)).toEqual([ACME]);
    });

    it("allows a checked package by its allowance, beside the other approval kinds", async () => {
        const { host, catalog } = setUp();
        const pluginRow = {
            pluginId: "/work/.camunda/plugins/resize",
            contentHash: "a".repeat(64),
        };
        host.pluginApprovals.approvals = [pluginRow];
        const pending = catalog.stillPendingOf([blocked(ACME, true), blocked(OTHER, true)]);

        const allowed = await catalog.applyAnswer(pending, { kind: "checked", ids: [ACME] });

        expect(allowed.map(({ id }) => id)).toEqual([ACME]);
        expect(host.pluginApprovals.approvals).toEqual([pluginRow, allowanceRowOf(ACME_ALLOWANCE)]);
        expect(host.notifier.logged("info")).toEqual([
            "Allowed bpmnlint rule package(s): bpmnlint-plugin-acme@1.2.0",
        ]);
        expect(catalog.stillPendingOf([blocked(NESTED_ACME, true)])).toEqual([]);
    });

    it("declines the unchecked packages by their allowance for this session and tells the gate so", async () => {
        const { catalog } = setUp();
        const pending = catalog.stillPendingOf([blocked(ACME, true), blocked(OTHER, true)]);

        await catalog.applyAnswer(pending, { kind: "checked", ids: [ACME] });

        expect([...catalog.declinedThisSession()]).toEqual([allowanceKeyOf(OTHER_ALLOWANCE)]);
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

    it("leaves a package to the view by its allowance", () => {
        const { catalog } = setUp();

        catalog.leaveForView({ id: NESTED_ACME, allowance: ACME_ALLOWANCE });

        expect(catalog.sessionAnswers()).toEqual(
            new Map([[allowanceKeyOf(ACME_ALLOWANCE), "leftForView"]]),
        );
        expect(catalog.stillPendingOf([blocked(ACME, true)])).toEqual([]);
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

    it("asks about nothing a 1.21.0 row allows at its root", () => {
        const { host, catalog } = setUp();
        host.pluginApprovals.approvals = [
            { pluginId: ACME, contentHash: `${RULE_PACKAGE_CONTENT_HASH_PREFIX}old` },
        ];

        expect(catalog.stillPendingOf([blocked(ACME, true)])).toEqual([]);
    });

    it("announces each change of the rule package rows, whoever made it", () => {
        const { host, catalog } = setUp();
        const acme = allowanceRowOf(ACME_ALLOWANCE);
        const other = allowanceRowOf(OTHER_ALLOWANCE);
        host.pluginApprovals.storeElsewhere([acme], { notify: true });
        const changes: CodeApprovalChange[] = [];
        catalog.onApprovalsChanged((change) => changes.push(change));

        host.pluginApprovals.storeElsewhere([other], { notify: true });
        host.pluginApprovals.storeElsewhere(
            [other, { pluginId: "/work/.camunda/plugins/resize", contentHash: "a".repeat(64) }],
            { notify: true },
        );

        expect(changes).toEqual([codeApprovalChange([other], [acme.pluginId])]);
    });

    it("remembers every id revoked this session, allowance keys and content row places alike", () => {
        const { host, catalog } = setUp();
        const contentRow = { pluginId: ACME, contentHash: `${RULE_PACKAGE_CONTENT_HASH_PREFIX}a` };
        const other = allowanceRowOf(OTHER_ALLOWANCE);
        host.pluginApprovals.storeElsewhere([contentRow, other], { notify: true });

        host.pluginApprovals.storeElsewhere([], { notify: true });

        expect(catalog.revokedThisSession()).toEqual(new Set([ACME, other.pluginId]));
    });

    it("follows no approval change once disposed", () => {
        const { host, catalog } = setUp();
        const changes: CodeApprovalChange[] = [];
        catalog.onApprovalsChanged((change) => changes.push(change));

        catalog.dispose();
        host.pluginApprovals.storeElsewhere([allowanceRowOf(ACME_ALLOWANCE)], { notify: true });

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
