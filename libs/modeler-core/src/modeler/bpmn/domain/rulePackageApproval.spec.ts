import { describe, expect, expectTypeOf, it } from "vitest";

import {
    type Allowance,
    allowanceKeyOf,
    allowanceRowOf,
    type AllowanceState,
} from "../../../kernel/domain/allowance";
import { RULE_PACKAGE_CONTENT_HASH_PREFIX } from "../../../kernel/domain/approvalRowKind";
import {
    type CodeApproval,
    type CodeApprovalChange,
    codeApprovalChange,
    type ProcessRestart,
} from "../../../kernel/domain/codeApproval";
import {
    type BlockedRulePackage,
    type BlockedState,
    editorsToRelint,
    evictionScopeOf,
    installedPackagesDirOf,
    nodeModulesDirOf,
    isParsedAsJson,
    loadsWithoutApproval,
    requestedPackageNameOf,
    RULE_PACKAGE_APPROVAL_NOTICE_ID,
    RULE_PACKAGE_APPROVAL_PROMPT_ID,
    RULE_PACKAGE_CODE_TEXTS,
    ruleModuleRootOf,
    type RuleModuleRoot,
    rulePackageApprovalNotice,
    rulePackageApprovalPrompt,
    rulePackageApprovalsKey,
    rulePackageLabelOf,
    rulePackageOf,
    rulePackagesToAsk,
    type RulePackage,
    rootKindOf,
    type RootKindFacts,
    rootStampPathsOf,
    type ResolvedRuleModule,
} from "./rulePackageApproval";

const repositoryAllowance = (addOn: string, path = "/repo/.git"): Allowance => ({
    kind: "rulePackage",
    host: "",
    origin: { kind: "repository", path },
    addOn,
});

describe("requestedPackageNameOf", () => {
    it.each<{ request: string; name: string | undefined }>([
        { request: "bpmnlint-plugin-acme", name: "bpmnlint-plugin-acme" },
        { request: "bpmnlint-plugin-acme/rules/label", name: "bpmnlint-plugin-acme" },
        { request: "@acme/bpmnlint-plugin-rules", name: "@acme/bpmnlint-plugin-rules" },
        { request: "@acme/bpmnlint-plugin-rules/config/all", name: "@acme/bpmnlint-plugin-rules" },
        { request: "@acme", name: undefined },
        { request: "@acme/", name: undefined },
        { request: "@acme/..", name: undefined },
        { request: "@acme/.", name: undefined },
        { request: "@acme/.hidden", name: undefined },
        { request: "x\\..\\evil", name: undefined },
        { request: "@acme\\..\\evil/rules", name: undefined },
        { request: "C:rules", name: undefined },
        { request: "C:/repo/rules/label.js", name: undefined },
        { request: ".", name: undefined },
        { request: "./rules/label", name: undefined },
        { request: "../rules/label", name: undefined },
        { request: "/repo/rules/label.js", name: undefined },
        { request: "C:\\repo\\rules\\label.js", name: undefined },
        { request: "", name: undefined },
    ])("names the package that $request asks for: $name", ({ request, name }) => {
        expect(requestedPackageNameOf(request)).toBe(name);
    });
});

describe("isParsedAsJson", () => {
    it.each<{ path: string; parsed: boolean }>([
        { path: "/repo/acme.json", parsed: true },
        { path: "/repo/acme.descriptor.json", parsed: true },
        { path: "C:/repo/acme.json", parsed: true },
        { path: "/repo/acme.JSON", parsed: false },
        { path: "/repo/acme.Json", parsed: false },
        { path: "/repo/.json", parsed: false },
        { path: "/repo/acme.json.js", parsed: false },
        { path: "/repo/acme.json/index.js", parsed: false },
        { path: "/repo/acme", parsed: false },
    ])("$path is parsed as JSON: $parsed", ({ path, parsed }) => {
        expect(isParsedAsJson(path)).toBe(parsed);
    });
});

describe("loadsWithoutApproval", () => {
    it.each<{ resolved: string; free: boolean }>([
        { resolved: "fs", free: true },
        { resolved: "node:fs", free: true },
        { resolved: "/repo/node_modules/bpmnlint-plugin-acme/package.json", free: true },
        { resolved: "C:/repo/package.json", free: true },
        { resolved: "/repo/node_modules/bpmnlint-plugin-acme/index.js", free: false },
        { resolved: "/repo/node_modules/bpmnlint-plugin-acme/addon.node", free: false },
        { resolved: "/repo/node_modules/bpmnlint-plugin-acme/data.JSON", free: false },
        { resolved: "C:/repo/index.js", free: false },
    ])("$resolved loads without approval: $free", ({ resolved, free }) => {
        expect(loadsWithoutApproval(resolved)).toBe(free);
    });
});

describe("ruleModuleRootOf", () => {
    const fromConfig = (
        file: string,
        more: Partial<ResolvedRuleModule> = {},
    ): ResolvedRuleModule => ({
        file,
        configDir: "/repo",
        requestsSelfPackage: false,
        ...more,
    });

    it.each<{ case: string; module: ResolvedRuleModule; root: RuleModuleRoot }>([
        {
            case: "a hoisted package",
            module: fromConfig("/repo/node_modules/bpmnlint-plugin-acme/index.js"),
            root: { kind: "package", id: "/repo/node_modules/bpmnlint-plugin-acme" },
        },
        {
            case: "a file deep in a package",
            module: fromConfig("/repo/node_modules/bpmnlint-plugin-acme/rules/sub/label.js"),
            root: { kind: "package", id: "/repo/node_modules/bpmnlint-plugin-acme" },
        },
        {
            case: "a scoped package",
            module: fromConfig("/repo/node_modules/@acme/bpmnlint-plugin-rules/index.js"),
            root: { kind: "package", id: "/repo/node_modules/@acme/bpmnlint-plugin-rules" },
        },
        {
            case: "a package nested in another, which its own hash covers",
            module: fromConfig(
                "/repo/node_modules/bpmnlint-plugin-acme/node_modules/@acme/shared/index.js",
            ),
            root: {
                kind: "package",
                id: "/repo/node_modules/bpmnlint-plugin-acme/node_modules/@acme/shared",
            },
        },
        {
            case: "a pnpm store path",
            module: fromConfig(
                "/repo/node_modules/.pnpm/bpmnlint-plugin-acme@1.2.0/node_modules/bpmnlint-plugin-acme/index.js",
            ),
            root: {
                kind: "package",
                id: "/repo/node_modules/.pnpm/bpmnlint-plugin-acme@1.2.0/node_modules/bpmnlint-plugin-acme",
            },
        },
        {
            case: "a scoped pnpm store path",
            module: fromConfig(
                "/repo/node_modules/.pnpm/@acme+rules@1.0.0/node_modules/@acme/rules/index.js",
            ),
            root: {
                kind: "package",
                id: "/repo/node_modules/.pnpm/@acme+rules@1.0.0/node_modules/@acme/rules",
            },
        },
        {
            case: "a Windows drive path",
            module: fromConfig("C:/repo/node_modules/@acme/rules/index.js", {
                configDir: "C:/repo",
            }),
            root: { kind: "package", id: "C:/repo/node_modules/@acme/rules" },
        },
        {
            case: "a package below a dot folder, such as a global install",
            module: fromConfig("/home/me/.npm-global/node_modules/bpmnlint-plugin-acme/index.js"),
            root: { kind: "package", id: "/home/me/.npm-global/node_modules/bpmnlint-plugin-acme" },
        },
        {
            case: "a file: link, by the folder the request named",
            module: fromConfig("/work/acme-rules/index.js", {
                requestedPackageDir: "/work/acme-rules",
            }),
            root: { kind: "package", id: "/work/acme-rules" },
        },
        {
            case: "a package in node_modules, even when the request named a linked folder",
            module: fromConfig("/work/acme-rules/node_modules/dep/index.js", {
                requestedPackageDir: "/work/acme-rules",
            }),
            root: { kind: "package", id: "/work/acme-rules/node_modules/dep" },
        },
        {
            case: "the self-package, by the config folder",
            module: fromConfig("/repo/rules/label.js", { requestsSelfPackage: true }),
            root: { kind: "selfPackage", id: "/repo" },
        },
        {
            case: "the self-package's entry at the config folder",
            module: fromConfig("/repo/index.js", { requestsSelfPackage: true }),
            root: { kind: "selfPackage", id: "/repo" },
        },
        {
            case: "a workspace file outside node_modules (an absolute rule reference)",
            module: fromConfig("/repo/scripts/evil.js"),
            root: { kind: "refused", reason: "outsideNodeModules" },
        },
        {
            case: "a config folder file when the config's package is not the one requested",
            module: fromConfig("/repo/index.js"),
            root: { kind: "refused", reason: "outsideNodeModules" },
        },
        {
            case: "a file beside the config folder, although the self-package is requested",
            module: fromConfig("/repo-evil/index.js", { requestsSelfPackage: true }),
            root: { kind: "refused", reason: "outsideNodeModules" },
        },
        {
            case: "a file outside the folder a request named",
            module: fromConfig("/work/elsewhere/index.js", {
                requestedPackageDir: "/work/acme-rules",
            }),
            root: { kind: "refused", reason: "outsideNodeModules" },
        },
        {
            case: "a linked folder that holds the config folder, which would cover the repo",
            module: fromConfig("/repo/scripts/evil.js", { requestedPackageDir: "/repo" }),
            root: { kind: "refused", reason: "linkHoldsConfigFolder" },
        },
        {
            case: "a linked folder above the config folder",
            module: fromConfig("/repo/scripts/evil.js", {
                configDir: "/repo/modeling",
                requestedPackageDir: "/repo",
            }),
            root: { kind: "refused", reason: "linkHoldsConfigFolder" },
        },
        {
            case: "a path in another spelling, which fails closed",
            module: fromConfig("C:\\repo\\node_modules\\acme\\index.js", { configDir: "C:/repo" }),
            root: { kind: "refused", reason: "outsideNodeModules" },
        },
        {
            case: "a file named node_modules",
            module: fromConfig("/repo/node_modules"),
            root: { kind: "refused", reason: "noPackageFolder" },
        },
        {
            case: "a file directly in node_modules",
            module: fromConfig("/repo/node_modules/evil.js"),
            root: { kind: "refused", reason: "noPackageFolder" },
        },
        {
            case: "a file directly in a scope folder",
            module: fromConfig("/repo/node_modules/@acme/evil.js"),
            root: { kind: "refused", reason: "noPackageFolder" },
        },
        {
            case: "a file in node_modules/.bin",
            module: fromConfig("/repo/node_modules/.bin/evil.js"),
            root: { kind: "refused", reason: "noPackageFolder" },
        },
        {
            case: "a file in the pnpm store outside any package",
            module: fromConfig("/repo/node_modules/.pnpm/evil.js"),
            root: { kind: "refused", reason: "noPackageFolder" },
        },
        {
            case: "a nested dot folder, never attributed to the package above it",
            module: fromConfig("/repo/node_modules/bpmnlint-plugin-acme/node_modules/.bin/evil.js"),
            root: { kind: "refused", reason: "noPackageFolder" },
        },
        {
            case: "a dot scope folder",
            module: fromConfig("/repo/node_modules/@acme/.hidden/evil.js"),
            root: { kind: "refused", reason: "noPackageFolder" },
        },
    ])("maps $case", ({ module, root }) => {
        expect(ruleModuleRootOf(module)).toEqual(root);
    });
});

describe("rulePackageOf", () => {
    const id =
        "/repo/node_modules/.pnpm/bpmnlint-plugin-acme@1.2.0/node_modules/bpmnlint-plugin-acme";
    const allowance = repositoryAllowance("node_modules/bpmnlint-plugin-acme");

    it.each<{ case: string; manifest: string | undefined; name: string; version: string }>([
        {
            case: "its manifest's name and version",
            manifest: '{ "name": "bpmnlint-plugin-acme", "version": "1.2.0" }',
            name: "bpmnlint-plugin-acme",
            version: "1.2.0",
        },
        {
            case: "its folder's name when the manifest names none",
            manifest: '{ "name": "", "version": "1.2.0" }',
            name: "bpmnlint-plugin-acme",
            version: "1.2.0",
        },
        {
            case: "its folder's name and no version without a manifest",
            manifest: undefined,
            name: "bpmnlint-plugin-acme",
            version: "",
        },
        {
            case: "its folder's name and no version for a manifest that is no JSON",
            manifest: "{",
            name: "bpmnlint-plugin-acme",
            version: "",
        },
    ])("names a package by $case", ({ manifest, name, version }) => {
        expect(rulePackageOf(id, manifest, allowance)).toEqual({ id, name, version, allowance });
    });
});

describe("rulePackageLabelOf", () => {
    it.each([
        { name: "bpmnlint-plugin-acme", version: "1.2.0", label: "bpmnlint-plugin-acme@1.2.0" },
        {
            name: "@acme/bpmnlint-plugin-rules",
            version: "2.0.0",
            label: "@acme/bpmnlint-plugin-rules@2.0.0",
        },
        { name: "bpmnlint-plugin-acme", version: "", label: "bpmnlint-plugin-acme" },
    ])("labels $name at version '$version' as $label", ({ name, version, label }) => {
        expect(rulePackageLabelOf({ name, version })).toBe(label);
    });
});

describe("rulePackagesToAsk", () => {
    const blocked = (
        id: string,
        needed: boolean,
        state: BlockedRulePackage["state"] = "new",
        addOn = id,
    ): BlockedRulePackage => ({
        id,
        name: id,
        version: "1.0.0",
        allowance: repositoryAllowance(addOn),
        kind: "package",
        state,
        needed,
    });
    const keyOf = (addOn: string) => allowanceKeyOf(repositoryAllowance(addOn));

    it.each<{ case: string; blocked: BlockedRulePackage[]; queued?: string[]; asked: string[] }>([
        { case: "a needed package", blocked: [blocked("/a", true)], asked: ["/a"] },
        {
            case: "only the packages no queued question asks about yet",
            blocked: [blocked("/a", true), blocked("/b", true)],
            queued: [keyOf("/a")],
            asked: ["/b"],
        },
        { case: "a package the bundle shadowed", blocked: [blocked("/a", false)], asked: [] },
        {
            case: "a package declined this session",
            blocked: [blocked("/a", true, "declined")],
            asked: [],
        },
        {
            case: "a package needed once and shadowed once, once",
            blocked: [blocked("/a", false), blocked("/a", true), blocked("/a", true)],
            asked: ["/a"],
        },
        {
            case: "a hoisted and a nested copy of one allowance, once at the first",
            blocked: [
                blocked("/repo/node_modules/acme", true, "new", "node_modules/acme"),
                blocked("/repo/node_modules/x/node_modules/acme", true, "new", "node_modules/acme"),
            ],
            asked: ["/repo/node_modules/acme"],
        },
        {
            case: "several packages, in the order they were blocked",
            blocked: [blocked("/b", true), blocked("/c", false), blocked("/a", true)],
            asked: ["/b", "/a"],
        },
    ])("asks about $case", ({ blocked: given, queued = [], asked }) => {
        expect(rulePackagesToAsk(given, new Set(queued)).map(({ id }) => id)).toEqual(asked);
    });

    it("spells the blocked states as allowance states", () => {
        expectTypeOf<BlockedState>().toExtend<AllowanceState>();
        expectTypeOf<BlockedState>().toEqualTypeOf<"new" | "declined">();
    });
});

describe("editorsToRelint", () => {
    const blockedByEditor = new Map<string, readonly string[]>([
        ["a.bpmn", ["/acme"]],
        ["b.bpmn", ["/other", "/acme"]],
        ["c.bpmn", ["/other"]],
        ["d.bpmn", []],
    ]);
    const hostLinted = ["d.bpmn", "e.bpmn", "a.bpmn"];
    const row = (addOn: string) => allowanceRowOf(repositoryAllowance(addOn));

    it.each<{ case: string; change: CodeApprovalChange; editors: string[] }>([
        {
            case: "every editor blocked on any package for one allowed package",
            change: codeApprovalChange([row("node_modules/acme")], []),
            editors: ["a.bpmn", "b.bpmn", "c.bpmn"],
        },
        {
            case: "each editor once, blocked on two allowed packages",
            change: codeApprovalChange([row("node_modules/acme"), row("node_modules/other")], []),
            editors: ["a.bpmn", "b.bpmn", "c.bpmn"],
        },
        {
            case: "every host-linted editor on a revoke, since no lint records what it admitted",
            change: codeApprovalChange([], ["/nobody"]),
            editors: ["d.bpmn", "e.bpmn", "a.bpmn"],
        },
        {
            case: "each editor once for the migration, which allows and revokes",
            change: codeApprovalChange([row("node_modules/acme")], ["/repo/node_modules/acme"]),
            editors: ["a.bpmn", "b.bpmn", "c.bpmn", "d.bpmn", "e.bpmn"],
        },
        {
            case: "no editor for no change",
            change: codeApprovalChange([], []),
            editors: [],
        },
    ])("relints $case", ({ change, editors }) => {
        expect(editorsToRelint(blockedByEditor, hostLinted, change)).toEqual(editors);
    });
});

describe("rulePackageApprovalsKey", () => {
    const acme = allowanceRowOf(repositoryAllowance("node_modules/acme"));
    const other = allowanceRowOf(repositoryAllowance("node_modules/other"));
    const contentRow = {
        pluginId: "/repo/node_modules/acme",
        contentHash: `${RULE_PACKAGE_CONTENT_HASH_PREFIX}a`,
    };
    const webviewPlugin = allowanceRowOf({
        ...repositoryAllowance(".camunda/plugins/resize"),
        kind: "plugin",
    });

    it("is independent of the order of the rows", () => {
        expect(rulePackageApprovalsKey([other, acme])).toBe(rulePackageApprovalsKey([acme, other]));
    });

    it("ignores webview plugin rows, so approving a plugin keeps the lint setup", () => {
        expect(rulePackageApprovalsKey([acme, webviewPlugin])).toBe(
            rulePackageApprovalsKey([acme]),
        );
    });

    it.each<{ case: string; approvals: CodeApproval[] }>([
        { case: "an added row", approvals: [acme, other] },
        { case: "a revoked row", approvals: [] },
        { case: "a row pinned to content, which the migration rewrites", approvals: [contentRow] },
        {
            case: "bytes moved between id and hash",
            approvals: [{ pluginId: `${acme.pluginId}","`, contentHash: acme.contentHash }],
        },
    ])("changes with $case", ({ approvals }) => {
        expect(rulePackageApprovalsKey(approvals)).not.toBe(rulePackageApprovalsKey([acme]));
    });
});

describe("rootStampPathsOf", () => {
    const root = "/repo/node_modules/.pnpm/acme@1.0.0/node_modules/acme";

    it.each<{ case: string; lookupDir: string | undefined; paths: string[] }>([
        {
            case: "the root's manifest alone without a lookup path",
            lookupDir: undefined,
            paths: [`${root}/package.json`],
        },
        {
            case: "the root's manifest alone when the lookup path is the root",
            lookupDir: root,
            paths: [`${root}/package.json`],
        },
        {
            case: "the lookup path's manifest too, so a retargeted link stamps differently",
            lookupDir: "/repo/node_modules/acme",
            paths: [`${root}/package.json`, "/repo/node_modules/acme/package.json"],
        },
    ])("stamps $case", ({ lookupDir, paths }) => {
        expect(rootStampPathsOf(root, lookupDir)).toEqual(paths);
    });
});

describe("evictionScopeOf", () => {
    it.each([
        {
            case: "an installed package",
            root: "/repo/node_modules/acme",
            scope: "/repo/node_modules",
        },
        {
            case: "a pnpm package, by its last node_modules",
            root: "/repo/node_modules/.pnpm/acme@1.0.0/node_modules/acme",
            scope: "/repo/node_modules/.pnpm/acme@1.0.0/node_modules",
        },
        {
            case: "a scoped package",
            root: "/repo/node_modules/@acme/rules",
            scope: "/repo/node_modules",
        },
        { case: "the config's own package", root: "/repo/rules", scope: "/repo/rules" },
        {
            case: "a linked package outside node_modules",
            root: "/work/acme-rules",
            scope: "/work/acme-rules",
        },
    ])("drops the modules of $case below $scope", ({ root, scope }) => {
        expect(evictionScopeOf(root)).toBe(scope);
    });
});

describe("rule package approval question", () => {
    const blockedOf = (
        id: string,
        name: string,
        version: string,
        kind: BlockedRulePackage["kind"] = "package",
    ): BlockedRulePackage => ({
        id,
        name,
        version,
        allowance: repositoryAllowance(`node_modules/${name}`),
        kind,
        state: "new",
        needed: true,
    });
    const acme = blockedOf(
        "/repo/node_modules/bpmnlint-plugin-acme",
        "bpmnlint-plugin-acme",
        "1.2.0",
    );
    const compat = blockedOf(
        "/repo/node_modules/.pnpm/bpmnlint-plugin-camunda-compat@2.0.0/node_modules/bpmnlint-plugin-camunda-compat",
        "bpmnlint-plugin-camunda-compat",
        "2.0.0",
    );
    const pending = [acme, compat];

    it.each<{ case: string; pending: RulePackage[]; message: string }>([
        {
            case: "one package",
            pending: pending.slice(0, 1),
            message:
                "1 bpmnlint rule package in this workspace is not allowed yet, so rules from it are skipped.",
        },
        {
            case: "several packages",
            pending,
            message:
                "2 bpmnlint rule packages in this workspace are not allowed yet, so rules from them are skipped.",
        },
    ])(
        "notices $case with its own id, opening the list only on Review…",
        ({ pending: given, message }) => {
            expect(rulePackageApprovalNotice(given)).toEqual({
                id: RULE_PACKAGE_APPROVAL_NOTICE_ID,
                tone: "info",
                message,
                actions: [{ label: "Review…", value: "review" }],
            });
        },
    );

    it("keeps ids of its own, so a host or the test kit never mistakes it for the plugin question", () => {
        expect([RULE_PACKAGE_APPROVAL_NOTICE_ID, RULE_PACKAGE_APPROVAL_PROMPT_ID]).toEqual([
            "bpmnlintPackageApprovalNotice",
            "bpmnlintPackageApproval",
        ]);
    });

    it("lists each package by name@version and its folder", () => {
        expect(rulePackageApprovalPrompt(pending, ["/repo"])).toEqual({
            id: RULE_PACKAGE_APPROVAL_PROMPT_ID,
            title: "Allow bpmnlint rule packages from this workspace?",
            placeholder:
                "Rule packages run as programs with your user's rights, not only inside the editor. Allowing one covers it in every worktree of its repository, or in its folder outside a repository, later changes included. Check only the ones you trust; open editors lint again with them.",
            items: [
                {
                    label: "bpmnlint-plugin-acme@1.2.0",
                    description: "node_modules/bpmnlint-plugin-acme",
                    value: acme.id,
                },
                {
                    label: "bpmnlint-plugin-camunda-compat@2.0.0",
                    description:
                        "node_modules/.pnpm/bpmnlint-plugin-camunda-compat@2.0.0/node_modules/bpmnlint-plugin-camunda-compat",
                    value: compat.id,
                },
            ],
        });
    });

    it("asks about one package in the singular", () => {
        const prompt = rulePackageApprovalPrompt(pending.slice(0, 1), ["/repo"]);

        expect([prompt.title, prompt.placeholder]).toEqual([
            "Allow a bpmnlint rule package from this workspace?",
            "A rule package runs as a program with your user's rights, not only inside the editor. Allowing it covers it in every worktree of its repository, or in its folder outside a repository, later changes included. Check it only if you trust it. Open editors lint again with it.",
        ]);
    });

    it("says which package the .bpmnlintrc sits in", () => {
        const self = blockedOf("/repo/rules", "acme-rules", "0.1.0", "selfPackage");

        expect(rulePackageApprovalPrompt([self], ["/repo"]).items[0]?.description).toBe(
            "rules · the package the .bpmnlintrc sits in",
        );
    });

    it("shows the folder in the text every host renders, not a path that replaces it", () => {
        const [item] = rulePackageApprovalPrompt([acme], ["/repo"]).items;

        expect(item?.path).toBeUndefined();
    });

    it("shows a package linked from outside the workspace by its full path", () => {
        const linked = { ...acme, id: "/work/acme-rules" };

        expect(rulePackageApprovalPrompt([linked], ["/repo"]).items[0]?.description).toBe(
            "/work/acme-rules",
        );
    });
});

describe("nodeModulesDirOf", () => {
    it("names the node_modules a folder installs its packages in", () => {
        expect(nodeModulesDirOf("/work/orders")).toBe("/work/orders/node_modules");
    });
});

describe("installedPackagesDirOf", () => {
    it.each([
        { id: "/work/node_modules/bpmnlint-plugin-acme", dir: "/work/node_modules" },
        { id: "/work/node_modules/@acme/bpmnlint-plugin", dir: "/work/node_modules" },
        {
            id: "/work/node_modules/a/node_modules/bpmnlint-plugin-b",
            dir: "/work/node_modules/a/node_modules",
        },
        { id: "/work/packages/rules", dir: undefined },
    ])("puts $id in $dir", ({ id, dir }) => {
        expect(installedPackagesDirOf(id)).toBe(dir);
    });
});

describe("rootKindOf", () => {
    const none: RootKindFacts = { realConfigDirs: [], linkedFromNodeModules: false };

    it.each<{ case: string; id: string; facts: RootKindFacts; root: RuleModuleRoot | undefined }>([
        {
            case: "the kind the gate reported, over everything else",
            id: "/work",
            facts: { ...none, reported: "package", realConfigDirs: ["/work"] },
            root: { kind: "package", id: "/work" },
        },
        {
            case: "a lint config's folder as the config's own package",
            id: "/work",
            facts: { ...none, realConfigDirs: ["/other", "/work"] },
            root: { kind: "selfPackage", id: "/work" },
        },
        {
            case: "a folder below node_modules as a package",
            id: "/work/node_modules/bpmnlint-plugin-acme",
            facts: none,
            root: { kind: "package", id: "/work/node_modules/bpmnlint-plugin-acme" },
        },
        {
            case: "a folder a node_modules entry links to as a package",
            id: "/work/packages/rules",
            facts: { ...none, realConfigDirs: ["/work"], linkedFromNodeModules: true },
            root: { kind: "package", id: "/work/packages/rules" },
        },
        {
            case: "a linked folder that holds a lint config as refused, as the gate refuses it",
            id: "/repo",
            facts: {
                ...none,
                realConfigDirs: ["/other", "/repo/modeling"],
                linkedFromNodeModules: true,
            },
            root: { kind: "refused", reason: "linkHoldsConfigFolder" },
        },
        {
            case: "any other folder as not known yet",
            id: "/work",
            facts: { ...none, realConfigDirs: ["/work/orders"] },
            root: undefined,
        },
    ])("tells $case", ({ id, facts, root }) => {
        expect(rootKindOf(id, facts)).toEqual(root);
    });
});

describe("RULE_PACKAGE_CODE_TEXTS", () => {
    it.each<{ restart: ProcessRestart; until: string }>([
        { restart: "reloadWindow", until: "reload the window" },
        { restart: "restartIde", until: "restart the IDE" },
    ])("says a revoked package's code stays loaded until you $until", ({ restart, until }) => {
        expect(RULE_PACKAGE_CODE_TEXTS.revokedFollowUp(restart)).toBe(
            `Code it already ran stays loaded until you ${until}.`,
        );
    });
});
