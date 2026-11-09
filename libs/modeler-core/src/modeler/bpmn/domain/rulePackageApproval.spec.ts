import { describe, expect, expectTypeOf, it } from "vitest";

import {
    type CodeApproval,
    type CodeApprovalChange,
    codeApprovalChange,
    type CodeState,
    declineKeyOf,
    type FollowedApprovalChange,
} from "../../../kernel/domain/codeApproval";
import {
    type BlockedRulePackage,
    type BlockedState,
    closureDigestInput,
    type ClosureMember,
    editorsToRelint,
    installedPackageNameOf,
    installedPackagesDirOf,
    nodeModulesDirOf,
    isParsedAsJson,
    isRulePackageApproval,
    loadsWithoutApproval,
    memberDigestInput,
    type PendingRulePackage,
    requestedPackageNameOf,
    RULE_PACKAGE_APPROVAL_NOTICE_ID,
    RULE_PACKAGE_APPROVAL_PROMPT_ID,
    RULE_PACKAGE_CONTENT_HASH_PREFIX,
    ruleModuleRootOf,
    type RuleModuleRoot,
    rulePackageApprovalNotice,
    rulePackageApprovalPrompt,
    rulePackageApprovalsKey,
    rulePackageContentHash,
    rulePackagesToAsk,
    type RulePackage,
    type RulePackageVerdict,
    type RulePackageVerdictContext,
    rulePackageVerdict,
    rootKindOf,
    type RootKindFacts,
    type ResolvedRuleModule,
} from "./rulePackageApproval";

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

describe("memberDigestInput", () => {
    it("lists every file by its path and hash, sorted by code unit, not by locale", () => {
        expect(
            memberDigestInput([
                { relPath: "rules/b.js", sha256: "22" },
                { relPath: "index.js", sha256: "11" },
                { relPath: "Rules/a.js", sha256: "33" },
            ]),
        ).toBe("Rules/a.js\u000033\u0000index.js\u000011\u0000rules/b.js\u000022\u0000");
    });

    it("is independent of the order the files were listed in", () => {
        const a = { relPath: "a.js", sha256: "1" };
        const b = { relPath: "b.js", sha256: "2" };

        expect(memberDigestInput([b, a])).toBe(memberDigestInput([a, b]));
    });

    it.each<{ case: string; changed: { relPath: string; sha256: string }[] }>([
        { case: "a changed file", changed: [{ relPath: "index.js", sha256: "99" }] },
        { case: "a renamed file", changed: [{ relPath: "main.js", sha256: "11" }] },
        {
            case: "an added file",
            changed: [
                { relPath: "index.js", sha256: "11" },
                { relPath: "extra.js", sha256: "11" },
            ],
        },
        {
            case: "bytes moved between path and hash",
            changed: [{ relPath: "index.js\u000011", sha256: "" }],
        },
    ])("changes with $case", ({ changed }) => {
        expect(memberDigestInput(changed)).not.toBe(
            memberDigestInput([{ relPath: "index.js", sha256: "11" }]),
        );
    });
});

describe("closureDigestInput", () => {
    const acme: ClosureMember = { name: "bpmnlint-plugin-acme", version: "1.2.0", digest: "aa" };
    const shared: ClosureMember = { name: "@acme/shared", version: "2.0.0", digest: "bb" };
    const lodash: ClosureMember = { name: "lodash", version: "4.17.21", digest: "cc" };

    it("names the root first, then every member by name@version and digest, sorted", () => {
        expect(closureDigestInput(acme, [lodash, acme, shared])).toBe(
            "bpmnlint-plugin-acme@1.2.0\u0000aa\u0000\n" +
                "@acme/shared@2.0.0\u0000bb\u0000" +
                "bpmnlint-plugin-acme@1.2.0\u0000aa\u0000" +
                "lodash@4.17.21\u0000cc\u0000",
        );
    });

    it("is independent of the order the closure walk found the members in", () => {
        expect(closureDigestInput(acme, [lodash, shared, acme])).toBe(
            closureDigestInput(acme, [acme, shared, lodash]),
        );
    });

    it("is independent of hoisting: a copy with the same content counts once", () => {
        expect(closureDigestInput(acme, [acme, shared, lodash, { ...lodash }])).toBe(
            closureDigestInput(acme, [acme, shared, lodash]),
        );
    });

    it("keeps two copies of one version whose content differs", () => {
        expect(closureDigestInput(acme, [acme, lodash, { ...lodash, digest: "dd" }])).not.toBe(
            closureDigestInput(acme, [acme, lodash]),
        );
    });

    it("orders two copies of one version by their digest, whatever order they came in", () => {
        const patched = { ...lodash, digest: "dd" };

        expect(closureDigestInput(acme, [acme, patched, lodash])).toBe(
            closureDigestInput(acme, [acme, lodash, patched]),
        );
    });

    it.each<{ case: string; root: ClosureMember; members: ClosureMember[] }>([
        { case: "a changed member", root: acme, members: [acme, { ...shared, digest: "b2" }] },
        {
            case: "a new member version",
            root: acme,
            members: [acme, { ...shared, version: "2.0.1" }],
        },
        { case: "an added member", root: acme, members: [acme, shared, lodash] },
        { case: "another member as the root", root: shared, members: [acme, shared] },
    ])("changes with $case", ({ root, members }) => {
        expect(closureDigestInput(root, members)).not.toBe(
            closureDigestInput(acme, [acme, shared]),
        );
    });
});

describe("rulePackageContentHash", () => {
    it("marks the closure digest as a rule package hash of algorithm version 1", () => {
        expect(RULE_PACKAGE_CONTENT_HASH_PREFIX).toBe("bpmnlint-closure-v1:");
        expect(rulePackageContentHash("abc")).toBe("bpmnlint-closure-v1:abc");
    });
});

describe("isRulePackageApproval", () => {
    it.each<{ case: string; approval: CodeApproval; isRulePackage: boolean }>([
        {
            case: "a rule package row",
            approval: { pluginId: "/repo/node_modules/x", contentHash: "bpmnlint-closure-v1:abc" },
            isRulePackage: true,
        },
        {
            case: "a webview plugin row",
            approval: { pluginId: "/repo/.camunda/plugins/x", contentHash: "abc" },
            isRulePackage: false,
        },
        {
            case: "a row whose hash only mentions the marker",
            approval: { pluginId: "/x", contentHash: "abc:bpmnlint-closure-v1:abc" },
            isRulePackage: false,
        },
    ])("tells $case", ({ approval, isRulePackage }) => {
        expect(isRulePackageApproval(approval)).toBe(isRulePackage);
    });
});

describe("rulePackageVerdict", () => {
    const root = "/repo/node_modules/bpmnlint-plugin-acme";
    const current = rulePackageContentHash("now");
    const old = rulePackageContentHash("old");
    const context = (more: Partial<RulePackageVerdictContext> = {}): RulePackageVerdictContext => ({
        approvals: [],
        admittedMembers: new Set(),
        declinedThisSession: new Set(),
        ...more,
    });
    const declined = (contentHash: string) =>
        new Set([declineKeyOf({ id: root, name: "bpmnlint-plugin-acme", contentHash })]);

    it.each<{
        case: string;
        context: RulePackageVerdictContext;
        contentHash?: string;
        verdict: RulePackageVerdict;
    }>([
        {
            case: "a package with no row, without hashing it",
            context: context(),
            verdict: { kind: "blocked", state: "new" },
        },
        {
            case: "the self-package with no row, like any other package",
            context: context({ approvals: [{ pluginId: "/other", contentHash: current }] }),
            verdict: { kind: "blocked", state: "new" },
        },
        {
            case: "a package with a row, before it is hashed",
            context: context({ approvals: [{ pluginId: root, contentHash: current }] }),
            verdict: { kind: "hashNeeded" },
        },
        {
            case: "a package whose row holds its current hash",
            context: context({ approvals: [{ pluginId: root, contentHash: current }] }),
            contentHash: current,
            verdict: { kind: "admitted", via: "approval" },
        },
        {
            case: "a package whose row holds another hash",
            context: context({ approvals: [{ pluginId: root, contentHash: old }] }),
            contentHash: current,
            verdict: { kind: "blocked", state: "changed" },
        },
        {
            case: "a member of an admitted closure at the same realpath, without hashing it",
            context: context({ admittedMembers: new Set([root]) }),
            verdict: { kind: "admitted", via: "closure" },
        },
        {
            case: "a package of the same name as an admitted member, at another realpath",
            context: context({
                admittedMembers: new Set([
                    "/repo/node_modules/x/node_modules/bpmnlint-plugin-acme",
                ]),
            }),
            verdict: { kind: "blocked", state: "new" },
        },
        {
            case: "a package whose only row is a webview plugin row with the same hash",
            context: context({ approvals: [{ pluginId: root, contentHash: "plain" }] }),
            contentHash: "plain",
            verdict: { kind: "blocked", state: "new" },
        },
        {
            case: "a new package declined this session, before it is hashed",
            context: context({ declinedThisSession: declined(current) }),
            verdict: { kind: "hashNeeded" },
        },
        {
            case: "a new package declined this session",
            context: context({ declinedThisSession: declined(current) }),
            contentHash: current,
            verdict: { kind: "blocked", state: "declined" },
        },
        {
            case: "a new package that changed since it was declined",
            context: context({ declinedThisSession: declined(old) }),
            contentHash: current,
            verdict: { kind: "blocked", state: "new" },
        },
        {
            case: "a changed package declined this session",
            context: context({
                approvals: [{ pluginId: root, contentHash: old }],
                declinedThisSession: declined(current),
            }),
            contentHash: current,
            verdict: { kind: "blocked", state: "declined" },
        },
        {
            case: "an approved package declined earlier in the session",
            context: context({
                approvals: [{ pluginId: root, contentHash: current }],
                declinedThisSession: declined(current),
            }),
            contentHash: current,
            verdict: { kind: "admitted", via: "approval" },
        },
        {
            case: "a package another package's decline only mentions",
            context: context({
                declinedThisSession: new Set([`${root}-evil#${current}`, `x${root}#${current}`]),
            }),
            verdict: { kind: "blocked", state: "new" },
        },
    ])("decides $case", ({ context: given, contentHash, verdict }) => {
        expect(rulePackageVerdict(root, given, contentHash)).toEqual(verdict);
    });

    it("spells the blocked states as code states", () => {
        expectTypeOf<BlockedState>().toExtend<CodeState>();
        expectTypeOf<BlockedState>().toEqualTypeOf<"new" | "changed" | "declined">();
    });
});

describe("rulePackagesToAsk", () => {
    const blocked = (
        id: string,
        needed: boolean,
        state: BlockedRulePackage["state"] = "new",
    ): BlockedRulePackage => ({ id, kind: "package", state, needed });

    it.each<{ case: string; blocked: BlockedRulePackage[]; queued?: string[]; asked: string[] }>([
        { case: "a needed package", blocked: [blocked("/a", true)], asked: ["/a"] },
        {
            case: "only the packages no queued question asks about yet",
            blocked: [blocked("/a", true), blocked("/b", true)],
            queued: ["/a"],
            asked: ["/b"],
        },
        {
            case: "a changed needed package",
            blocked: [blocked("/a", true, "changed")],
            asked: ["/a"],
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
            case: "several packages, in the order they were blocked",
            blocked: [blocked("/b", true), blocked("/c", false), blocked("/a", true)],
            asked: ["/b", "/a"],
        },
    ])("asks about $case", ({ blocked: given, queued = [], asked }) => {
        expect(rulePackagesToAsk(given, new Set(queued)).map(({ id }) => id)).toEqual(asked);
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
    const row = (pluginId: string) => ({ pluginId, contentHash: rulePackageContentHash("h") });

    const followed = (
        change: CodeApprovalChange,
        withdrawn: readonly string[] = change.revoke,
    ): FollowedApprovalChange => ({ change, withdrawn });

    it.each<{ case: string; followed: FollowedApprovalChange; editors: string[] }>([
        {
            case: "the editors blocked on one allowed package",
            followed: followed(codeApprovalChange([row("/acme")], [])),
            editors: ["a.bpmn", "b.bpmn"],
        },
        {
            case: "each editor once, blocked on two allowed packages",
            followed: followed(codeApprovalChange([row("/acme"), row("/other")], [])),
            editors: ["a.bpmn", "b.bpmn", "c.bpmn"],
        },
        {
            case: "no editor for a package none is blocked on",
            followed: followed(codeApprovalChange([row("/nobody")], [])),
            editors: [],
        },
        {
            case: "every host-linted editor on a revoke, since no lint records what it admitted",
            followed: followed(codeApprovalChange([], ["/nobody"])),
            editors: ["d.bpmn", "e.bpmn", "a.bpmn"],
        },
        {
            case: "every host-linted editor for a package allowed at another content",
            followed: followed(codeApprovalChange([row("/acme")], []), ["/acme"]),
            editors: ["a.bpmn", "b.bpmn", "d.bpmn", "e.bpmn"],
        },
        {
            case: "each editor once on a revoke beside an allow",
            followed: followed(codeApprovalChange([row("/other")], ["/acme"])),
            editors: ["b.bpmn", "c.bpmn", "d.bpmn", "e.bpmn", "a.bpmn"],
        },
        {
            case: "no editor for no change",
            followed: followed(codeApprovalChange([], [])),
            editors: [],
        },
    ])("relints $case", ({ followed: given, editors }) => {
        expect(editorsToRelint(blockedByEditor, hostLinted, given)).toEqual(editors);
    });
});

describe("rulePackageApprovalsKey", () => {
    const acme = { pluginId: "/repo/node_modules/acme", contentHash: rulePackageContentHash("a") };
    const other = {
        pluginId: "/repo/node_modules/other",
        contentHash: rulePackageContentHash("b"),
    };
    const webviewPlugin = { pluginId: "/repo/.camunda/plugins/resize", contentHash: "c" };

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
        {
            case: "a row of other content",
            approvals: [{ ...acme, contentHash: other.contentHash }],
        },
        {
            case: "bytes moved between id and hash",
            approvals: [
                { pluginId: `${acme.pluginId}","`, contentHash: rulePackageContentHash("a") },
            ],
        },
    ])("changes with $case", ({ approvals }) => {
        expect(rulePackageApprovalsKey(approvals)).not.toBe(rulePackageApprovalsKey([acme]));
    });

    it("orders two rows of one id by their hash", () => {
        const acmeOld = { ...acme, contentHash: rulePackageContentHash("0") };

        expect(rulePackageApprovalsKey([acme, acmeOld])).toBe(
            rulePackageApprovalsKey([acmeOld, acme]),
        );
    });
});

describe("rule package approval question", () => {
    const acme: RulePackage = {
        id: "/repo/node_modules/bpmnlint-plugin-acme",
        name: "bpmnlint-plugin-acme",
        version: "1.2.0",
        contentHash: rulePackageContentHash("a"),
    };
    const compat: RulePackage = {
        id: "/repo/node_modules/.pnpm/bpmnlint-plugin-camunda-compat@2.0.0/node_modules/bpmnlint-plugin-camunda-compat",
        name: "bpmnlint-plugin-camunda-compat",
        version: "2.0.0",
        contentHash: rulePackageContentHash("b"),
    };
    const pending: PendingRulePackage[] = [
        { artifact: acme, state: "new" },
        { artifact: compat, state: "changed" },
    ];

    it.each<{ case: string; pending: PendingRulePackage[]; message: string }>([
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

    it("lists each package by name and version, with its state and folder", () => {
        expect(rulePackageApprovalPrompt(pending, ["/repo"])).toEqual({
            id: RULE_PACKAGE_APPROVAL_PROMPT_ID,
            title: "Allow bpmnlint rule packages from this workspace?",
            placeholder:
                "Rule packages run as programs with your user's rights, not only inside the editor. Check only the ones you trust; open editors lint again with them.",
            items: [
                {
                    label: "bpmnlint-plugin-acme 1.2.0",
                    description: "new · node_modules/bpmnlint-plugin-acme",
                    value: acme.id,
                },
                {
                    label: "bpmnlint-plugin-camunda-compat 2.0.0",
                    description:
                        "changed since you allowed it · node_modules/.pnpm/bpmnlint-plugin-camunda-compat@2.0.0/node_modules/bpmnlint-plugin-camunda-compat",
                    value: compat.id,
                },
            ],
        });
    });

    it("asks about one package in the singular", () => {
        const prompt = rulePackageApprovalPrompt(pending.slice(0, 1), ["/repo"]);

        expect([prompt.title, prompt.placeholder]).toEqual([
            "Allow a bpmnlint rule package from this workspace?",
            "A rule package runs as a program with your user's rights, not only inside the editor. Check it only if you trust it; open editors lint again with it.",
        ]);
    });

    it.each<{ case: string; state: PendingRulePackage["state"]; shown: string }>([
        { case: "a new package", state: "new", shown: "new" },
        { case: "a changed package", state: "changed", shown: "changed since you allowed it" },
    ])(
        "shows the state of $case first, in the text every host renders, not a path that replaces it",
        ({ state, shown }) => {
            const [item] = rulePackageApprovalPrompt([{ artifact: acme, state }], ["/repo"]).items;

            expect(item?.path).toBeUndefined();
            expect(item?.description?.startsWith(`${shown} · `)).toBe(true);
        },
    );

    it("shows a package linked from outside the workspace by its full path", () => {
        const linked = { ...acme, id: "/work/acme-rules" };

        expect(
            rulePackageApprovalPrompt([{ artifact: linked, state: "new" }], ["/repo"]).items[0]
                ?.description,
        ).toBe("new · /work/acme-rules");
    });
});

describe("installedPackageNameOf", () => {
    it.each([
        { id: "/work/node_modules/bpmnlint-plugin-acme", name: "bpmnlint-plugin-acme" },
        { id: "/work/node_modules/@acme/bpmnlint-plugin", name: "@acme/bpmnlint-plugin" },
        { id: "/work/node_modules/a/node_modules/bpmnlint-plugin-b", name: "bpmnlint-plugin-b" },
        { id: "/work/packages/rules", name: "rules" },
    ])("names $id $name", ({ id, name }) => {
        expect(installedPackageNameOf(id)).toBe(name);
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

    it.each<{ case: string; id: string; facts: RootKindFacts; kind: string | undefined }>([
        {
            case: "the kind the gate reported, over everything else",
            id: "/work",
            facts: { ...none, reported: "package", realConfigDirs: ["/work"] },
            kind: "package",
        },
        {
            case: "a lint config's folder as the config's own package",
            id: "/work",
            facts: { ...none, realConfigDirs: ["/other", "/work"] },
            kind: "selfPackage",
        },
        {
            case: "a folder below node_modules as a package",
            id: "/work/node_modules/bpmnlint-plugin-acme",
            facts: none,
            kind: "package",
        },
        {
            case: "a folder a node_modules entry links to as a package",
            id: "/work/packages/rules",
            facts: { ...none, linkedFromNodeModules: true },
            kind: "package",
        },
        {
            case: "any other folder as not known yet",
            id: "/work",
            facts: { ...none, realConfigDirs: ["/work/orders"] },
            kind: undefined,
        },
    ])("tells $case", ({ id, facts, kind }) => {
        expect(rootKindOf(id, facts)).toBe(kind);
    });
});
