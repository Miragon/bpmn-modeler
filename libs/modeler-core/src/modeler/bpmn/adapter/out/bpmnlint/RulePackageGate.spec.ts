import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { CodeApproval, declineKeyOf } from "../../../../../kernel/domain/codeApproval";
import { InMemoryInstalledPackages } from "../../../../../testing";
import { FingerprintedRoot } from "../../../domain/packageClosure";
import { PackageClosureFingerprinter } from "../../../service/PackageClosureFingerprinter";
import { RulePackageGate } from "./RulePackageGate";

const REPO = "/repo";
const NODE_MODULES = `${REPO}/node_modules`;
const ACME = `${NODE_MODULES}/bpmnlint-plugin-acme`;
const ACME_DEP = `${NODE_MODULES}/acme-dep`;
const OTHER = `${NODE_MODULES}/bpmnlint-plugin-other`;
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
    let fingerprints: PackageClosureFingerprinter;
    let approvals: CodeApproval[];
    let declined: Set<string>;
    let loadedContentHashes: Map<string, string>;

    function install(
        dir: string,
        name: string,
        dependencies: Record<string, string> = {},
        files: Record<string, string> = { "index.js": `module.exports = "${dir}";` },
    ): void {
        disk.writeFile(
            `${dir}/package.json`,
            JSON.stringify({ name, version: "1.0.0", dependencies }),
        );
        for (const [relPath, content] of Object.entries(files)) {
            disk.writeFile(`${dir}/${relPath}`, content);
        }
    }

    function contentHashOf(root: FingerprintedRoot): string {
        const fingerprint = fingerprints.fingerprint(root);
        if (fingerprint.kind !== "fingerprinted") {
            throw new Error(`refused: ${fingerprint.reason}`);
        }
        return fingerprint.rulePackage.contentHash;
    }

    function approve(root: FingerprintedRoot): void {
        approvals.push({ pluginId: root.id, contentHash: contentHashOf(root) });
    }

    function gateFor(configDir = REPO): RulePackageGate {
        return new RulePackageGate({
            sources: {
                approvals: { read: () => approvals },
                fingerprints,
                packages: disk,
                declinedThisSession: () => declined,
            },
            approvals,
            configDir,
            loadedContentHashes,
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

    beforeEach(() => {
        disk = new InMemoryInstalledPackages((bytes) =>
            createHash("sha256").update(bytes).digest("hex"),
        );
        fingerprints = new PackageClosureFingerprinter(disk);
        approvals = [];
        declined = new Set();
        loadedContentHashes = new Map();
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
    ])("loads $case without approval", ({ request, file }) => {
        install(ACME, "bpmnlint-plugin-acme");
        disk.writeFile(`${REPO}/package.json`, "{}");
        const fake = fakeScopedRequire({ [request]: file });

        const outcome = requireFor(gateFor(), fake, "bpmnlint-plugin-acme", request);

        expect(outcome).toEqual({ loaded: true, blocked: [] });
        expect(fake.loaded).toEqual([file]);
    });

    it("blocks a package with no row as new and loads nothing", () => {
        install(ACME, "bpmnlint-plugin-acme");
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });
        const gate = gateFor();

        const outcome = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome).toEqual({ loaded: false, blocked: [ACME] });
        expect(fake.loaded).toEqual([]);
        expect(disk.filesHashed).toEqual([]);
        expect(gate.blockedPackages(new Set())).toEqual([
            { id: ACME, state: "new", needed: false },
        ]);
    });

    it("throws a miss that NodeResolver swallows like a package that is not installed", () => {
        install(ACME, "bpmnlint-plugin-acme");
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });

        expect(() => gateFor().require(fake.scopedRequire)("bpmnlint-plugin-acme")).toThrow(
            expect.objectContaining({ code: "MODULE_NOT_FOUND" }),
        );
    });

    it("loads the file it checked, though a second lookup would find another", () => {
        install(ACME, "bpmnlint-plugin-acme");
        install(OTHER, "bpmnlint-plugin-other");
        approve({ kind: "package", id: ACME });
        const fake = fakeScopedRequire({});
        const lookups = [`${ACME}/index.js`, `${OTHER}/index.js`];
        fake.scopedRequire.resolve = ((request: string) =>
            request.startsWith("/") ? request : lookups.shift()) as NodeRequire["resolve"];

        requireFor(gateFor(), fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(fake.loaded).toEqual([`${ACME}/index.js`]);
    });

    it("lets an approved package and its closure members run", () => {
        install(ACME, "bpmnlint-plugin-acme", { "acme-dep": "1.0.0" });
        install(ACME_DEP, "acme-dep");
        disk.writeFile(`${ACME_DEP}/rules/label.js`, "module.exports = 1;");
        approve({ kind: "package", id: ACME });
        const fake = fakeScopedRequire({
            "bpmnlint-plugin-acme": `${ACME}/index.js`,
            "acme-dep/rules/label": `${ACME_DEP}/rules/label.js`,
        });
        const gate = gateFor();

        const acme = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
        const dep = requireFor(gate, fake, "acme-dep", "acme-dep/rules/label");

        expect([acme.loaded, dep.loaded]).toEqual([true, true]);
        expect(gate.blockedPackages(new Set())).toEqual([]);
    });

    it("blocks an approved package whose content changed since", () => {
        install(ACME, "bpmnlint-plugin-acme");
        approve({ kind: "package", id: ACME });
        disk.writeFile(`${ACME}/index.js`, "module.exports = 'changed';");
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });
        const gate = gateFor();

        const outcome = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome.loaded).toBe(false);
        expect(gate.blockedPackages(new Set([ACME]))).toEqual([
            { id: ACME, state: "changed", needed: true },
        ]);
    });

    it("reports a package declined this session as declined", () => {
        install(ACME, "bpmnlint-plugin-acme");
        const contentHash = contentHashOf({ kind: "package", id: ACME });
        declined.add(declineKeyOf({ id: ACME, name: "bpmnlint-plugin-acme", contentHash }));
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });
        const gate = gateFor();

        requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(gate.blockedPackages(new Set())).toEqual([
            { id: ACME, state: "declined", needed: false },
        ]);
    });

    it("refuses a workspace file outside node_modules and never offers it", () => {
        install(ACME, "bpmnlint-plugin-acme");
        approve({ kind: "package", id: ACME });
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

    it("refuses a file of an approved package that its hash leaves out, with the reason", () => {
        install(ACME, "bpmnlint-plugin-acme");
        disk.writeFile(`${ACME}/.git/evil.js`, "module.exports = 1;");
        approve({ kind: "package", id: ACME });
        const gate = gateFor();

        const outcome = requireFor(
            gate,
            fakeScopedRequire({}),
            "bpmnlint-plugin-acme",
            `${ACME}/.git/evil.js`,
        );

        expect(outcome).toEqual({ loaded: false, blocked: [] });
        expect(gate.refusedModules()).toEqual([
            { kind: "module", file: `${ACME}/.git/evil.js`, reason: "notHashed" },
        ]);
    });

    it("refuses a resolved file it cannot find on disk, with the reason", () => {
        const gate = gateFor();

        requireFor(gate, fakeScopedRequire({}), "bpmnlint-plugin-acme", `${ACME}/gone.js`);

        expect(gate.refusedModules()).toEqual([
            { kind: "module", file: `${ACME}/gone.js`, reason: "noPackageFolder" },
        ]);
    });

    it("refuses a package whose closure cannot be fingerprinted, without offering it", () => {
        install(ACME, "bpmnlint-plugin-acme");
        approve({ kind: "package", id: ACME });
        disk.writeFile("/outside/secret.js", "module.exports = 1;");
        disk.createSymbolicLink(`${ACME}/secret.js`, "/outside/secret.js");
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });
        const gate = gateFor();

        const outcome = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(outcome).toEqual({ loaded: false, blocked: [] });
        expect(gate.blockedPackages(new Set())).toEqual([]);
        expect(gate.refusedModules()).toEqual([
            { kind: "closure", id: ACME, memberDir: ACME, reason: "linksOutsideFolder" },
        ]);
    });

    it("refuses a package whose closure grew too large to check, naming the member", () => {
        install(ACME, "bpmnlint-plugin-acme", { "acme-dep": "1.0.0" });
        install(ACME_DEP, "acme-dep");
        approve({ kind: "package", id: ACME });
        disk.writeFile(`${ACME_DEP}/big.js`, "x".repeat(10_000));
        fingerprints = new PackageClosureFingerprinter(disk, { entries: 100, bytes: 1_000 });
        const gate = gateFor();

        requireFor(gate, fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` }), "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(gate.refusedModules()).toEqual([
            { kind: "closure", id: ACME, memberDir: ACME_DEP, reason: "tooLarge" },
        ]);
    });

    it("stops reporting a refusal once the package is admitted in the same setup", () => {
        install(ACME, "bpmnlint-plugin-acme");
        approve({ kind: "package", id: ACME });
        disk.createSymbolicLink(`${ACME}/self.js`, `${ACME}`);
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });
        const gate = gateFor();
        requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
        const refusedBefore = gate.refusedModules();

        disk.remove(`${ACME}/self.js`);
        const after = requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

        expect(refusedBefore).toHaveLength(1);
        expect(after.loaded).toBe(true);
        expect(gate.refusedModules()).toEqual([]);
    });

    it("takes a linked package's own files by the folder its package name links to", () => {
        install(LINKED, "bpmnlint-plugin-linked");
        disk.createSymbolicLink(`${NODE_MODULES}/bpmnlint-plugin-linked`, LINKED);
        disk.writeFile(`${LINKED}/rules/label.js`, "module.exports = 1;");
        approve({ kind: "package", id: LINKED });
        const fake = fakeScopedRequire({ "bpmnlint-plugin-linked": `${LINKED}/index.js` });
        const gate = gateFor();

        const entry = requireFor(gate, fake, "bpmnlint-plugin-linked", "bpmnlint-plugin-linked");
        const localRule = requireFor(
            gate,
            fake,
            "bpmnlint-plugin-linked",
            `${LINKED}/rules/label.js`,
        );

        expect([entry.loaded, localRule.loaded]).toEqual([true, true]);
    });

    it("asks for the self-package like any other package", () => {
        disk.writeFile(
            `${REPO}/package.json`,
            JSON.stringify({ name: "bpmnlint-plugin-self", version: "1.0.0" }),
        );
        disk.writeFile(`${REPO}/index.js`, "module.exports = {};");
        const fake = fakeScopedRequire({ ".": `${REPO}/index.js` });

        const blocked = requireFor(gateFor(), fake, "bpmnlint-plugin-self", ".");
        approve({ kind: "selfPackage", id: REPO });
        const allowed = requireFor(gateFor(), fake, "bpmnlint-plugin-self", ".");

        expect(blocked).toEqual({ loaded: false, blocked: [REPO] });
        expect(allowed).toEqual({ loaded: true, blocked: [] });
    });

    it("refuses a config folder file for a request that is not the self-package's", () => {
        disk.writeFile(
            `${REPO}/package.json`,
            JSON.stringify({ name: "bpmnlint-plugin-self", version: "1.0.0" }),
        );
        disk.writeFile(`${REPO}/index.js`, "module.exports = {};");
        approve({ kind: "selfPackage", id: REPO });
        const fake = fakeScopedRequire({});

        const gate = gateFor();

        const outcome = requireFor(gate, fake, "bpmnlint-plugin-acme", `${REPO}/index.js`);

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
        expect(gate.blockedPackages(new Set([OTHER]))).toEqual([
            { id: ACME, state: "new", needed: false },
            { id: OTHER, state: "new", needed: true },
        ]);
    });

    it("stops reporting a package once a closure admitted later in the setup holds it", () => {
        install(ACME, "bpmnlint-plugin-acme", { "bpmnlint-plugin-other": "1.0.0" });
        install(OTHER, "bpmnlint-plugin-other");
        approve({ kind: "package", id: ACME });
        const fake = fakeScopedRequire({
            "bpmnlint-plugin-acme": `${ACME}/index.js`,
            "bpmnlint-plugin-other": `${OTHER}/index.js`,
        });
        const gate = gateFor();

        const before = requireFor(gate, fake, "bpmnlint-plugin-other", "bpmnlint-plugin-other");
        requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
        const after = requireFor(gate, fake, "bpmnlint-plugin-other", "bpmnlint-plugin-other");

        expect([before.loaded, after.loaded]).toEqual([false, true]);
        expect(gate.blockedPackages(new Set([OTHER]))).toEqual([]);
    });

    it("sees a change to an admitted closure member by its stamps", () => {
        install(ACME, "bpmnlint-plugin-acme", { "acme-dep": "1.0.0" });
        install(ACME_DEP, "acme-dep");
        approve({ kind: "package", id: ACME });
        const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });
        const gate = gateFor();
        requireFor(gate, fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
        const unchanged = gate.isUnchanged();

        disk.writeFile(`${ACME_DEP}/index.js`, "module.exports = 'changed';");

        expect([unchanged, gate.isUnchanged()]).toEqual([true, false]);
    });

    describe("loaded modules", () => {
        function admitAcme(): FakeScopedRequire {
            const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });
            requireFor(gateFor(), fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
            return fake;
        }

        beforeEach(() => {
            install(ACME, "bpmnlint-plugin-acme", { "acme-dep": "1.0.0" });
            install(ACME_DEP, "acme-dep");
            approve({ kind: "package", id: ACME });
        });

        it("keeps a closure's modules loaded while its content stays the same", () => {
            const fake = admitAcme();
            fake.cache[`${ACME_DEP}/index.js`] = {};

            admitAcme();

            expect(Object.keys(fake.cache)).toContain(`${ACME_DEP}/index.js`);
        });

        it("drops every module under the closure's members once it is approved with new content", () => {
            const fake = fakeScopedRequire({ "bpmnlint-plugin-acme": `${ACME}/index.js` });
            requireFor(gateFor(), fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");
            Object.assign(fake.cache, {
                [`${ACME_DEP}/index.js`]: {},
                [`${OTHER}/index.js`]: {},
                [`${ACME}-fork/index.js`]: {},
            });
            disk.writeFile(`${ACME_DEP}/index.js`, "module.exports = 'v2';");
            approvals.splice(0, approvals.length);
            approve({ kind: "package", id: ACME });

            requireFor(gateFor(), fake, "bpmnlint-plugin-acme", "bpmnlint-plugin-acme");

            expect(Object.keys(fake.cache).sort()).toEqual([
                `${ACME}-fork/index.js`,
                `${ACME}/index.js`,
                `${OTHER}/index.js`,
            ]);
            expect(fake.loaded).toEqual([`${ACME}/index.js`, `${ACME}/index.js`]);
        });
    });
});
