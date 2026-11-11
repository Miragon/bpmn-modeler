import { beforeEach, describe, expect, it } from "vitest";

import {
    allowanceKeyOf,
    allowanceRowOf,
    LOCAL_HOST,
} from "../../../../../kernel/domain/allowance";
import { RULE_PACKAGE_CONTENT_HASH_PREFIX } from "../../../../../kernel/domain/approvalRowKind";
import { CodeApproval } from "../../../../../kernel/domain/codeApproval";
import { AllowanceLocator } from "../../../../../kernel/service/AllowanceLocator";
import {
    InMemoryInstalledPackages,
    writeLinkedWorktree,
    writeRepository,
} from "../../../../../testing";
import { PathStamp } from "../../../domain/packageClosure";
import { RulePackageGate } from "./RulePackageGate";

const REPO = "/repo";
const NODE_MODULES = `${REPO}/node_modules`;
const ACME = `${NODE_MODULES}/bpmnlint-plugin-acme`;
const ACME_DEP = `${NODE_MODULES}/acme-dep`;
const OTHER = `${NODE_MODULES}/bpmnlint-plugin-other`;
const WORKTREE = "/worktree";
const LINKED = "/work/linked-rules";

interface FakeScopedRequire {
    readonly scopedRequire: NodeRequire;
    readonly loaded: string[];
    readonly cache: Record<string, unknown>;
}

/** Resolves a request by the table, as Node would from the config folder, and loads nothing real. */
function fakeScopedRequire(resolutions: Record<string, string>): FakeScopedRequire {
    const loaded: string[] = [];
    const cache: Record<string, unknown> = {};
    const resolve = (request: string) => {
        const file = resolutions[request] ?? (request.startsWith("/") ? request : undefined);
        if (file === undefined) {
            throw Object.assign(new Error(`Cannot find module '${request}'`), {
                code: "MODULE_NOT_FOUND",
            });
        }
        return file;
    };
    const scopedRequire: NodeRequire = Object.assign(
        (request: string) => {
            const file = scopedRequire.resolve(request);
            loaded.push(file);
            cache[file] = { file };
            return { file };
        },
        { resolve, cache },
    ) as unknown as NodeRequire;
    return { scopedRequire, loaded, cache };
}

describe("RulePackageGate", () => {
    let disk: InMemoryInstalledPackages;
    let allowances: AllowanceLocator;
    let approvals: CodeApproval[];
    let declined: Set<string>;
    let loadedManifestStamps: Map<string, PathStamp | undefined>;

    function install(dir: string, name: string, version = "1.0.0"): void {
        disk.writeFile(`${dir}/package.json`, JSON.stringify({ name, version }));
        disk.writeFile(`${dir}/index.js`, `module.exports = "${dir}";`);
    }

    function allow(dir: string): void {
        approvals.push(allowanceRowOf(allowances.allowanceAt("rulePackage", dir)));
    }

    function gateFor(configDir = REPO): RulePackageGate {
        return new RulePackageGate({
            sources: {
                approvals: { read: () => approvals },
                packages: disk,
                allowances,
                declinedThisSession: () => declined,
            },
            approvals,
            configDir,
            loadedManifestStamps,
        });
    }

    /** Requires inside one bpmnlint request for `pkg`, as NodeResolver does. */
    function requireFor(
        gate: RulePackageGate,
        fake: FakeScopedRequire,
        pkg: string,
        request: string,
    ): { loaded: boolean; blocked: readonly string[] } {
        const gated = gate.require(fake.scopedRequire);
        gate.beginRequest(pkg);
        try {
            gated(request);
            return { loaded: true, blocked: gate.blockedSinceBegin() };
        } catch {
            return { loaded: false, blocked: gate.blockedSinceBegin() };
        }
    }

    const acmeRequire = () => fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });

    beforeEach(() => {
        disk = new InMemoryInstalledPackages();
        allowances = new AllowanceLocator(disk, LOCAL_HOST);
        approvals = [];
        declined = new Set();
        loadedManifestStamps = new Map();
        writeRepository(disk, REPO);
        disk.writeFile(`${REPO}/.bpmnlintrc`, "{}");
    });

    it.each([
        { case: "a built-in module", request: "fs", file: "fs" },
        { case: "JSON data", request: "./package.json", file: `${REPO}/package.json` },
        {
            case: "JSON data in a package nobody allowed",
            request: "bpmnlint-plugin-acme/package.json",
            file: `${ACME}/package.json`,
        },
    ])("loads $case without an allowance", ({ request, file }) => {
        install(ACME, "bpmnlint-plugin-acme");
        disk.writeFile(`${REPO}/package.json`, "{}");
        const fake = fakeScopedRequire({ [request]: file });

        const outcome = requireFor(gateFor(), fake, "bpmnlint-plugin-acme", request);

        expect(outcome).toEqual({ loaded: true, blocked: [] });
        expect(fake.loaded).toEqual([file]);
    });

    it("blocks a package nobody allowed as new, named by its manifest, and loads nothing", () => {
        install(ACME, "bpmnlint-plugin-acme", "1.2.0");
        const fake = acmeRequire();
        const gate = gateFor();

        const outcome = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome).toEqual({ loaded: false, blocked: [ACME] });
        expect(fake.loaded).toEqual([]);
        expect(gate.blockedPackages(new Set([ACME]))).toEqual([
            {
                id: ACME,
                name: "bpmnlint-plugin-acme",
                version: "1.2.0",
                allowance: allowances.allowanceAt("rulePackage", ACME),
                kind: "package",
                state: "new",
                needed: true,
            },
        ]);
    });

    it("admits a package by its allowance row", () => {
        install(ACME, "bpmnlint-plugin-acme");
        allow(ACME);
        const gate = gateFor();

        const outcome = requireFor(gate, acmeRequire(), "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome).toEqual({ loaded: true, blocked: [] });
        expect(gate.blockedPackages(new Set())).toEqual([]);
    });

    it("admits a package a 1.21.0 row allows at its root, whatever content it held", () => {
        install(ACME, "bpmnlint-plugin-acme");
        approvals.push({ pluginId: ACME, contentHash: `${RULE_PACKAGE_CONTENT_HASH_PREFIX}old` });

        const outcome = requireFor(gateFor(), acmeRequire(), "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome.loaded).toBe(true);
    });

    it("blocks a package a 1.21.0 row allows only at another root", () => {
        install(ACME, "bpmnlint-plugin-acme");
        approvals.push({
            pluginId: "/clone/node_modules/bpmnlint-plugin-acme",
            contentHash: `${RULE_PACKAGE_CONTENT_HASH_PREFIX}same`,
        });

        const outcome = requireFor(gateFor(), acmeRequire(), "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome).toEqual({ loaded: false, blocked: [ACME] });
    });

    it("admits a package changed since it was allowed", () => {
        install(ACME, "bpmnlint-plugin-acme");
        allow(ACME);
        disk.writeFile(`${ACME}/index.js`, "module.exports = 'changed';");

        const outcome = requireFor(gateFor(), acmeRequire(), "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome.loaded).toBe(true);
    });

    it("reports a package whose allowance was declined this session as declined", () => {
        install(ACME, "bpmnlint-plugin-acme");
        declined.add(allowanceKeyOf(allowances.allowanceAt("rulePackage", ACME)));
        const gate = gateFor();

        requireFor(gate, acmeRequire(), "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(gate.blockedPackages(new Set()).map(({ state }) => state)).toEqual(["declined"]);
    });

    it("admits a package in a linked worktree by the main checkout's allowance", () => {
        writeLinkedWorktree(disk, REPO, WORKTREE);
        const worktreeAcme = `${WORKTREE}/node_modules/bpmnlint-plugin-acme`;
        install(ACME, "bpmnlint-plugin-acme");
        install(worktreeAcme, "bpmnlint-plugin-acme", "2.0.0");
        allow(ACME);
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${worktreeAcme}/index.js` });

        const outcome = requireFor(gateFor(WORKTREE), fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome).toEqual({ loaded: true, blocked: [] });
    });

    it("lets a nested copy share the allowance of the hoisted one, as its own root", () => {
        const nested = `${NODE_MODULES}/bpmnlint-plugin-other/node_modules/bpmnlint-plugin-acme`;
        install(ACME, "bpmnlint-plugin-acme");
        install(nested, "bpmnlint-plugin-acme", "0.9.0");
        allow(ACME);
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${nested}/index.js` });
        const gate = gateFor();

        const outcome = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
        disk.writeFile(`${nested}/package.json`, '{ "name": "bpmnlint-plugin-acme", "version": "0.9.1" }');

        expect(outcome.loaded).toBe(true);
        expect(gate.isUnchanged()).toBe(false);
    });

    it("blocks a rule package another one requires until it has its own allowance", () => {
        install(ACME, "bpmnlint-plugin-acme");
        install(OTHER, "bpmnlint-plugin-other");
        allow(ACME);
        const fake = fakeScopedRequire({
            "bpmnlint-plugin-acme": `${ACME}/index.js`,
            "bpmnlint-plugin-other": `${OTHER}/index.js`,
        });
        const gate = gateFor();

        const acme = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
        const other = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-other");

        expect([acme.loaded, other.loaded]).toEqual([true, false]);
        expect(gate.blockedPackages(new Set()).map(({ id }) => id)).toEqual([OTHER]);
    });

    it("takes a package linked from another repository by that repository's allowance", () => {
        writeRepository(disk, "/work");
        install(LINKED, "bpmnlint-plugin-linked");
        disk.createSymbolicLink(`${NODE_MODULES}/bpmnlint-plugin-linked`, LINKED);
        approvals.push(
            allowanceRowOf({
                kind: "rulePackage",
                host: LOCAL_HOST,
                origin: { kind: "repository", path: `${REPO}/.git` },
                addOn: "node_modules/bpmnlint-plugin-linked",
            }),
        );
        const fake = fakeScopedRequire({ "bpmnlint-plugin-linked": `${LINKED}/index.js` });

        const before = requireFor(gateFor(), fake, "bpmnlint-plugin-linked", "bpmnlint-plugin-linked");
        allow(LINKED);
        const after = requireFor(gateFor(), fake, "bpmnlint-plugin-linked", "bpmnlint-plugin-linked");

        expect(allowances.allowanceAt("rulePackage", LINKED).origin).toEqual({
            kind: "repository",
            path: "/work/.git",
        });
        expect([before.loaded, after.loaded]).toEqual([false, true]);
    });

    it("takes a linked package's own files by the folder its package name links to", () => {
        install(LINKED, "bpmnlint-plugin-linked");
        disk.createSymbolicLink(`${NODE_MODULES}/bpmnlint-plugin-linked`, LINKED);
        disk.writeFile(`${LINKED}/rules/label.js`, "module.exports = 1;");
        allow(LINKED);
        const fake = fakeScopedRequire({ "bpmnlint-plugin-linked": `${LINKED}/index.js` });
        const gate = gateFor();

        const entry = requireFor(gate, fake, "bpmnlint-plugin-linked", "bpmnlint-plugin-linked");
        const localRule = requireFor(gate, fake, "bpmnlint-plugin-linked", `${LINKED}/rules/label.js`);

        expect([entry.loaded, localRule.loaded]).toEqual([true, true]);
    });

    it("throws a miss that NodeResolver swallows like a package that is not installed", () => {
        install(ACME, "bpmnlint-plugin-acme");

        expect(() => gateFor().require(acmeRequire().scopedRequire)("bpmnlint-plugin-acme")).toThrow(
            expect.objectContaining({ code: "MODULE_NOT_FOUND" }),
        );
    });

    it("loads the file it checked, though a second lookup would find another", () => {
        install(ACME, "bpmnlint-plugin-acme");
        install(OTHER, "bpmnlint-plugin-other");
        allow(ACME);
        const fake = fakeScopedRequire({});
        const lookups = [`${ACME}/index.js`, `${OTHER}/index.js`];
        fake.scopedRequire.resolve = ((request: string) =>
            request.startsWith("/") ? request : lookups.shift()) as NodeRequire["resolve"];

        requireFor(gateFor(), fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(fake.loaded).toEqual([`${ACME}/index.js`]);
    });

    it("refuses a workspace file outside node_modules and never offers it", () => {
        install(ACME, "bpmnlint-plugin-acme");
        allow(ACME);
        disk.writeFile(`${REPO}/scripts/evil.js`, "module.exports = 1;");
        const fake = fakeScopedRequire({});
        const gate = gateFor();

        const outcome = requireFor(gate, fake, "bpmnlint-plugin-acme", `${REPO}/scripts/evil.js`);

        expect(outcome).toEqual({ loaded: false, blocked: [] });
        expect(fake.loaded).toEqual([]);
        expect(gate.blockedPackages(new Set())).toEqual([]);
        expect(gate.refusedModules()).toEqual([
            { kind: "module", file: `${REPO}/scripts/evil.js`, reason: "outsideNodeModules" },
        ]);
    });

    it("refuses a file inside a .git folder of an allowed package, with the reason", () => {
        install(ACME, "bpmnlint-plugin-acme");
        disk.writeFile(`${ACME}/.git/evil.js`, "module.exports = 1;");
        allow(ACME);
        const gate = gateFor();

        const outcome = requireFor(gate, fakeScopedRequire({}), "bpmnlint-plugin-acme", `${ACME}/.git/evil.js`);

        expect(outcome).toEqual({ loaded: false, blocked: [] });
        expect(gate.refusedModules()).toEqual([
            { kind: "module", file: `${ACME}/.git/evil.js`, reason: "insideGitFolder" },
        ]);
    });

    it("refuses a resolved file it cannot find on disk, with the reason", () => {
        const gate = gateFor();

        requireFor(gate, fakeScopedRequire({}), "bpmnlint-plugin-acme", `${ACME}/gone.js`);

        expect(gate.refusedModules()).toEqual([
            { kind: "module", file: `${ACME}/gone.js`, reason: "noPackageFolder" },
        ]);
    });

    it("asks for the self-package like any other package, by its own allowance", () => {
        disk.writeFile(
            `${REPO}/package.json`,
            JSON.stringify({ name: "bpmnlint-plugin-self", version: "1.0.0" }),
        );
        disk.writeFile(`${REPO}/index.js`, "module.exports = {};");
        const fake = fakeScopedRequire({ ".": `${REPO}/index.js` });

        const blockedGate = gateFor();
        const blocked = requireFor(blockedGate, fake, "bpmnlint-plugin-self", ".");
        allow(REPO);
        const allowed = requireFor(gateFor(), fake, "bpmnlint-plugin-self", ".");

        expect(blocked).toEqual({ loaded: false, blocked: [REPO] });
        expect(blockedGate.blockedPackages(new Set()).map(({ kind }) => kind)).toEqual([
            "selfPackage",
        ]);
        expect(allowed).toEqual({ loaded: true, blocked: [] });
    });

    it("refuses a config folder file for a request that is not the self-package's", () => {
        disk.writeFile(
            `${REPO}/package.json`,
            JSON.stringify({ name: "bpmnlint-plugin-self", version: "1.0.0" }),
        );
        disk.writeFile(`${REPO}/index.js`, "module.exports = {};");
        allow(REPO);
        const gate = gateFor();

        const outcome = requireFor(gate, fakeScopedRequire({}), "bpmnlint-plugin-acme", `${REPO}/index.js`);

        expect(outcome).toEqual({ loaded: false, blocked: [] });
        expect(gate.refusedModules()).toEqual([
            { kind: "module", file: `${REPO}/index.js`, reason: "outsideNodeModules" },
        ]);
    });

    it("lists only the packages blocked since the request began", () => {
        install(ACME, "bpmnlint-plugin-acme");
        install(OTHER, "bpmnlint-plugin-other");
        const fake = fakeScopedRequire({
            "bpmnlint-plugin-acme": `${ACME}/index.js`,
            "bpmnlint-plugin-other": `${OTHER}/index.js`,
        });
        const gate = gateFor();

        requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
        const other = requireFor(gate, fake, "bpmnlint-plugin-other", "bpmnlint-plugin-other");

        expect(other.blocked).toEqual([OTHER]);
        expect(gate.blockedPackages(new Set([OTHER])).map(({ id, needed }) => ({ id, needed }))).toEqual([
            { id: ACME, needed: false },
            { id: OTHER, needed: true },
        ]);
    });

    describe("isUnchanged", () => {
        it("turns false once an admitted root's package.json changes, and not for another file", () => {
            install(ACME, "bpmnlint-plugin-acme");
            allow(ACME);
            const gate = gateFor();
            requireFor(gate, acmeRequire(), "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

            disk.writeFile(`${ACME}/index.js`, "module.exports = 'edited';");
            const afterEdit = gate.isUnchanged();
            disk.writeFile(`${ACME}/package.json`, '{ "name": "bpmnlint-plugin-acme", "version": "1.0.1" }');

            expect([afterEdit, gate.isUnchanged()]).toEqual([true, false]);
        });

        it("turns false once the link the package was looked up through points to another version", () => {
            const store = `${NODE_MODULES}/.pnpm`;
            const v1 = `${store}/bpmnlint-plugin-acme@1.0.0/node_modules/bpmnlint-plugin-acme`;
            const v2 = `${store}/bpmnlint-plugin-acme@1.0.1/node_modules/bpmnlint-plugin-acme`;
            install(v1, "bpmnlint-plugin-acme", "1.0.0");
            install(v2, "bpmnlint-plugin-acme", "1.0.1");
            disk.createSymbolicLink(ACME, v1);
            allow(v1);
            const gate = gateFor();
            const outcome = requireFor(
                gate,
                fakeScopedRequire({ "bpmnlint-plugin-acme": `${v1}/index.js` }),
                "bpmnlint-plugin-acme",
                "bpmnlint-plugin-acme",
            );
            const linked = gate.isUnchanged();

            disk.remove(ACME);
            disk.createSymbolicLink(ACME, v2);

            expect([outcome.loaded, linked, gate.isUnchanged()]).toEqual([true, true, false]);
        });
    });

    describe("loaded modules", () => {
        const UNRELATED = `${REPO}/lib/helper.js`;

        function admitAcme(): FakeScopedRequire {
            const fake = acmeRequire();
            Object.assign(fake.cache, {
                [`${ACME_DEP}/index.js`]: {},
                [`${OTHER}/index.js`]: {},
                [UNRELATED]: {},
            });
            requireFor(gateFor(), fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
            return fake;
        }

        beforeEach(() => {
            install(ACME, "bpmnlint-plugin-acme");
            install(ACME_DEP, "acme-dep");
            allow(ACME);
        });

        it("keeps the modules loaded while the root's package.json stays the same", () => {
            admitAcme();
            disk.writeFile(`${ACME_DEP}/index.js`, "module.exports = 'edited';");

            const fake = admitAcme();

            expect(Object.keys(fake.cache).sort()).toEqual(
                [`${ACME_DEP}/index.js`, `${ACME}/index.js`, `${OTHER}/index.js`, UNRELATED].sort(),
            );
        });

        it("drops every module of the root's node_modules once its package.json changed", () => {
            admitAcme();
            disk.writeFile(`${ACME}/package.json`, '{ "name": "bpmnlint-plugin-acme", "version": "1.0.1" }');
            const fake = acmeRequire();
            Object.assign(fake.cache, {
                [`${ACME_DEP}/index.js`]: {},
                [`${OTHER}/index.js`]: {},
                [UNRELATED]: {},
            });

            requireFor(gateFor(), fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

            expect(Object.keys(fake.cache).sort()).toEqual([UNRELATED, `${ACME}/index.js`]);
            expect(fake.loaded).toEqual([`${ACME}/index.js`]);
        });

        it("drops nothing the first time a root is loaded", () => {
            const fake = admitAcme();

            expect(Object.keys(fake.cache)).toContain(`${ACME_DEP}/index.js`);
        });
    });
});
