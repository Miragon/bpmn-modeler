import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { InMemoryInstalledPackages } from "../../../testing";
import type { ClosureFingerprint, ClosureSize } from "../domain/packageClosure";
import { RULE_PACKAGE_CONTENT_HASH_PREFIX } from "../domain/rulePackageApproval";
import { FingerprintedRoot, PackageClosureFingerprinter } from "./PackageClosureFingerprinter";

const REPO = "/repo";
const NODE_MODULES = `${REPO}/node_modules`;
const PLUGIN = `${NODE_MODULES}/bpmnlint-plugin-acme`;
const PLUGIN_ROOT: FingerprintedRoot = { kind: "package", id: PLUGIN };
const SELF_ROOT: FingerprintedRoot = { kind: "selfPackage", id: REPO };

interface Manifest {
    readonly name: string;
    readonly version?: string;
    readonly dependencies?: Record<string, string>;
    readonly optionalDependencies?: Record<string, string>;
    readonly peerDependencies?: Record<string, string>;
}

describe("PackageClosureFingerprinter", () => {
    let disk: InMemoryInstalledPackages;
    let fingerprinter: PackageClosureFingerprinter;

    function freshDisk(): InMemoryInstalledPackages {
        return new InMemoryInstalledPackages((bytes) =>
            createHash("sha256").update(bytes).digest("hex"),
        );
    }

    function install(
        dir: string,
        manifest: Manifest,
        files: Record<string, string | Uint8Array> = { "index.js": `module.exports = "${dir}";` },
        on: InMemoryInstalledPackages = disk,
    ): void {
        on.writeFile(`${dir}/package.json`, JSON.stringify({ version: "1.0.0", ...manifest }));
        for (const [relPath, content] of Object.entries(files)) {
            on.writeFile(`${dir}/${relPath}`, content);
        }
    }

    function fingerprinted(
        root: FingerprintedRoot = PLUGIN_ROOT,
        using: PackageClosureFingerprinter = fingerprinter,
    ): Extract<ClosureFingerprint, { kind: "fingerprinted" }> {
        const fingerprint = using.fingerprint(root);
        if (fingerprint.kind !== "fingerprinted") {
            throw new Error(`refused: ${fingerprint.reason} at ${fingerprint.memberDir}`);
        }
        return fingerprint;
    }

    const contentHashOf = (root: FingerprintedRoot = PLUGIN_ROOT) =>
        fingerprinted(root).rulePackage.contentHash;

    beforeEach(() => {
        disk = freshDisk();
        fingerprinter = new PackageClosureFingerprinter(disk);
    });

    describe("the closure", () => {
        it("names the package by its folder, name and version, with a marked content hash", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme", version: "2.3.4" });

            const { rulePackage, memberDirs } = fingerprinted();

            expect(rulePackage).toMatchObject({
                id: PLUGIN,
                name: "bpmnlint-plugin-acme",
                version: "2.3.4",
            });
            expect(rulePackage.contentHash).toMatch(
                new RegExp(`^${RULE_PACKAGE_CONTENT_HASH_PREFIX}[0-9a-f]{64}$`),
            );
            expect(memberDirs).toEqual([PLUGIN]);
        });

        it("takes in dependencies, optional and peer dependencies, recursively", () => {
            install(PLUGIN, {
                name: "bpmnlint-plugin-acme",
                dependencies: { "min-dash": "4" },
                optionalDependencies: { "@bpmn-io/feel": "1" },
                peerDependencies: { bpmnlint: "11" },
            });
            install(`${NODE_MODULES}/min-dash`, { name: "min-dash" });
            install(`${NODE_MODULES}/@bpmn-io/feel`, { name: "@bpmn-io/feel" });
            install(`${NODE_MODULES}/bpmnlint`, {
                name: "bpmnlint",
                dependencies: { "bpmnlint-utils": "1" },
            });
            install(`${NODE_MODULES}/bpmnlint-utils`, { name: "bpmnlint-utils" });

            expect([...fingerprinted().memberDirs].sort()).toEqual([
                `${NODE_MODULES}/@bpmn-io/feel`,
                `${NODE_MODULES}/bpmnlint`,
                PLUGIN,
                `${NODE_MODULES}/bpmnlint-utils`,
                `${NODE_MODULES}/min-dash`,
            ]);
        });

        it("hashes a peer's files, so a changed peer changes the content hash", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme", peerDependencies: { bpmnlint: "11" } });
            install(`${NODE_MODULES}/bpmnlint`, { name: "bpmnlint" });
            const before = contentHashOf();

            disk.writeFile(`${NODE_MODULES}/bpmnlint/index.js`, "changed");

            expect(contentHashOf()).not.toBe(before);
        });

        it("skips a missing optional, peer or required dependency", () => {
            install(PLUGIN, {
                name: "bpmnlint-plugin-acme",
                dependencies: { "not-installed": "1" },
                optionalDependencies: { fsevents: "2" },
                peerDependencies: { bpmnlint: "11" },
            });

            expect(fingerprinted().memberDirs).toEqual([PLUGIN]);
        });

        it("resolves a dependency from the nearest node_modules, keeping two versions apart", () => {
            install(PLUGIN, {
                name: "bpmnlint-plugin-acme",
                dependencies: { semver: "7", other: "1" },
            });
            install(`${PLUGIN}/node_modules/semver`, { name: "semver", version: "7.0.0" });
            install(`${NODE_MODULES}/other`, { name: "other", dependencies: { semver: "5" } });
            install(`${NODE_MODULES}/semver`, { name: "semver", version: "5.0.0" });

            expect([...fingerprinted().memberDirs].sort()).toEqual([
                PLUGIN,
                `${PLUGIN}/node_modules/semver`,
                `${NODE_MODULES}/other`,
                `${NODE_MODULES}/semver`,
            ]);
        });

        it("resolves from a member's real folder, as pnpm links its dependencies beside it", () => {
            const store = `${NODE_MODULES}/.pnpm/bpmnlint-plugin-acme@1.0.0/node_modules`;
            install(`${store}/bpmnlint-plugin-acme`, {
                name: "bpmnlint-plugin-acme",
                dependencies: { "min-dash": "4" },
            });
            install(`${NODE_MODULES}/.pnpm/min-dash@4.0.0/node_modules/min-dash`, {
                name: "min-dash",
            });
            disk.createSymbolicLink(
                `${store}/min-dash`,
                `${NODE_MODULES}/.pnpm/min-dash@4.0.0/node_modules/min-dash`,
            );
            disk.createSymbolicLink(PLUGIN, `${store}/bpmnlint-plugin-acme`);

            expect(
                fingerprinted({ kind: "package", id: `${store}/bpmnlint-plugin-acme` }).memberDirs,
            ).toEqual([
                `${store}/bpmnlint-plugin-acme`,
                `${NODE_MODULES}/.pnpm/min-dash@4.0.0/node_modules/min-dash`,
            ]);
        });

        it("counts each member once, also when dependencies loop", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme", dependencies: { a: "1" } });
            install(`${NODE_MODULES}/a`, {
                name: "a",
                dependencies: { "b": "1", "bpmnlint-plugin-acme": "1" },
            });
            install(`${NODE_MODULES}/b`, { name: "b", dependencies: { a: "1" } });

            expect([...fingerprinted().memberDirs].sort()).toEqual([
                `${NODE_MODULES}/a`,
                `${NODE_MODULES}/b`,
                PLUGIN,
            ]);
        });

        it("gives the same content hash whether a dependency is hoisted or nested", () => {
            const nested = freshDisk();
            install(PLUGIN, { name: "bpmnlint-plugin-acme", dependencies: { "min-dash": "4" } });
            install(`${NODE_MODULES}/min-dash`, { name: "min-dash" }, { "index.js": "dash" });
            install(
                PLUGIN,
                { name: "bpmnlint-plugin-acme", dependencies: { "min-dash": "4" } },
                undefined,
                nested,
            );
            install(
                `${PLUGIN}/node_modules/min-dash`,
                { name: "min-dash" },
                { "index.js": "dash" },
                nested,
            );

            const nestedHash = fingerprinted(PLUGIN_ROOT, new PackageClosureFingerprinter(nested))
                .rulePackage.contentHash;

            expect(contentHashOf()).toBe(nestedHash);
        });
    });

    describe("a member's digest", () => {
        it("leaves out the member's own node_modules and .git", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" });
            const before = contentHashOf();

            disk.writeFile(`${PLUGIN}/node_modules/unused/index.js`, "x");
            disk.writeFile(`${PLUGIN}/.git/HEAD`, "ref: refs/heads/main");

            expect(contentHashOf()).toBe(before);
        });

        it("keeps a deeper node_modules, which Node could load from", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" });
            const before = contentHashOf();

            disk.writeFile(`${PLUGIN}/lib/node_modules/evil/index.js`, "x");

            expect(contentHashOf()).not.toBe(before);
        });

        it("hashes bytes, so two files a text decoder reads alike differ", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" }, { "a.bin": new Uint8Array([0xff]) });
            const before = contentHashOf();

            disk.writeFile(`${PLUGIN}/a.bin`, new Uint8Array([0xfe]));

            expect(contentHashOf()).not.toBe(before);
        });

        it("hashes every file whatever its extension", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" }, { "addon.node": "binary" });
            const before = contentHashOf();

            disk.writeFile(`${PLUGIN}/addon.node`, "other binary");

            expect(contentHashOf()).not.toBe(before);
        });

        it("tells a renamed file apart", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" }, { "rules/a.js": "x" });
            const before = contentHashOf();

            disk.remove(`${PLUGIN}/rules/a.js`);
            disk.writeFile(`${PLUGIN}/rules/b.js`, "x");

            expect(contentHashOf()).not.toBe(before);
        });

        it("hashes a linked file inside the member as its target", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" }, { "lib/a.js": "x" });
            disk.createSymbolicLink(`${PLUGIN}/index.js`, `${PLUGIN}/lib/a.js`);
            const before = contentHashOf();

            disk.writeFile(`${PLUGIN}/lib/a.js`, "changed");

            expect(contentHashOf()).not.toBe(before);
        });
    });

    describe("the self-package", () => {
        beforeEach(() => {
            install(REPO, { name: "bpmnlint-plugin-self" }, { "rules/label.js": "rule" });
        });

        it("leaves out the models, the config and .git", () => {
            const before = contentHashOf(SELF_ROOT);

            disk.writeFile(`${REPO}/order.bpmn`, "<definitions/>");
            disk.writeFile(`${REPO}/decisions/route.dmn`, "<definitions/>");
            disk.writeFile(`${REPO}/forms/start.form`, "{}");
            disk.writeFile(`${REPO}/.bpmnlintrc`, "{}");
            disk.writeFile(`${REPO}/.git/HEAD`, "ref: refs/heads/main");

            expect(contentHashOf(SELF_ROOT)).toBe(before);
        });

        it("hashes its rules", () => {
            const before = contentHashOf(SELF_ROOT);

            disk.writeFile(`${REPO}/rules/label.js`, "changed");

            expect(contentHashOf(SELF_ROOT)).not.toBe(before);
        });

        it("hashes the models its dependencies ship", () => {
            disk.writeFile(
                `${REPO}/package.json`,
                JSON.stringify({ name: "bpmnlint-plugin-self", dependencies: { dep: "1" } }),
            );
            install(`${NODE_MODULES}/dep`, { name: "dep" }, { "test/order.bpmn": "a" });
            const before = contentHashOf(SELF_ROOT);

            disk.writeFile(`${NODE_MODULES}/dep/test/order.bpmn`, "b");

            expect(contentHashOf(SELF_ROOT)).not.toBe(before);
        });

        it("hashes the models of an installed package that ships some", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" }, { "test/order.bpmn": "a" });
            const before = contentHashOf();

            disk.writeFile(`${PLUGIN}/test/order.bpmn`, "b");

            expect(contentHashOf()).not.toBe(before);
        });
    });

    describe("refusals", () => {
        it.each<{ case: string; link: (dir: string) => [path: string, target: string] }>([
            { case: "a file outside the member", link: (dir) => [`${dir}/a.js`, "/etc/passwd"] },
            { case: "a folder inside the member", link: (dir) => [`${dir}/lib2`, `${dir}/lib`] },
            { case: "nothing", link: (dir) => [`${dir}/a.js`, `${dir}/missing.js`] },
        ])("refuses a member with a link to $case", ({ link }) => {
            disk.writeFile("/etc/passwd", "root");
            install(PLUGIN, { name: "bpmnlint-plugin-acme", dependencies: { dep: "1" } });
            install(`${NODE_MODULES}/dep`, { name: "dep" }, { "lib/x.js": "x" });
            disk.createSymbolicLink(...link(`${NODE_MODULES}/dep`));

            expect(fingerprinter.fingerprint(PLUGIN_ROOT)).toEqual({
                kind: "refused",
                reason: "linksOutsideFolder",
                memberDir: `${NODE_MODULES}/dep`,
            });
        });

        it("refuses a member holding a file no hash can read", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" });
            disk.createSpecialFile(`${PLUGIN}/rules/fifo.js`);

            expect(fingerprinter.fingerprint(PLUGIN_ROOT)).toEqual({
                kind: "refused",
                reason: "specialFile",
                memberDir: PLUGIN,
            });
        });

        it.each<{ case: string; prepare: () => void }>([
            { case: "no manifest", prepare: () => disk.writeFile(`${PLUGIN}/index.js`, "x") },
            {
                case: "a manifest that is no JSON",
                prepare: () => disk.writeFile(`${PLUGIN}/package.json`, "{"),
            },
            { case: "no folder", prepare: () => undefined },
        ])("refuses a root with $case as unreadable", ({ prepare }) => {
            prepare();

            expect(fingerprinter.fingerprint(PLUGIN_ROOT)).toEqual({
                kind: "refused",
                reason: "unreadable",
                memberDir: PLUGIN,
            });
        });

        it.each<{ case: string; limit: ClosureSize }>([
            { case: "too many entries", limit: { entries: 4, bytes: 1_000_000 } },
            { case: "too many bytes", limit: { entries: 1000, bytes: 250 } },
        ])("refuses a closure with $case before hashing it", ({ limit }) => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme", dependencies: { dep: "1" } });
            install(
                `${NODE_MODULES}/dep`,
                { name: "dep" },
                { "a.js": "x".repeat(200), "b.js": "y" },
            );
            const limited = new PackageClosureFingerprinter(disk, limit);

            expect(limited.fingerprint(PLUGIN_ROOT)).toEqual({
                kind: "refused",
                reason: "tooLarge",
                memberDir: `${NODE_MODULES}/dep`,
            });
            expect(
                disk.filesHashed.filter((path) => path.startsWith(`${NODE_MODULES}/dep`)),
            ).toEqual([]);
        });

        it("counts a remembered member against the limit too", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme", dependencies: { dep: "1" } });
            install(`${NODE_MODULES}/dep`, { name: "dep" }, { "a.js": "a", "b.js": "b" });
            const limited = new PackageClosureFingerprinter(disk, { entries: 5, bytes: 1_000_000 });
            expect(limited.fingerprint({ kind: "package", id: `${NODE_MODULES}/dep` }).kind).toBe(
                "fingerprinted",
            );

            expect(limited.fingerprint(PLUGIN_ROOT)).toEqual({
                kind: "refused",
                reason: "tooLarge",
                memberDir: `${NODE_MODULES}/dep`,
            });
        });

        it.each<{ case: string; inject: () => void }>([
            {
                case: "a folder that can no longer be listed",
                inject: () => {
                    const list = disk.listDirectory.bind(disk);
                    vi.spyOn(disk, "listDirectory").mockImplementation((path) =>
                        path === `${PLUGIN}/lib` ? undefined : list(path),
                    );
                },
            },
            {
                case: "a file gone before its stamp",
                inject: () => {
                    const stamp = disk.stamp.bind(disk);
                    vi.spyOn(disk, "stamp").mockImplementation((path) =>
                        path === `${PLUGIN}/lib/a.js` ? undefined : stamp(path),
                    );
                },
            },
            {
                case: "a file gone before its hash",
                inject: () => {
                    const hash = disk.sha256OfFile.bind(disk);
                    vi.spyOn(disk, "sha256OfFile").mockImplementation((path) =>
                        path === `${PLUGIN}/lib/a.js` ? undefined : hash(path),
                    );
                },
            },
        ])("refuses a member as unreadable with $case", ({ inject }) => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" }, { "lib/a.js": "a" });
            inject();

            expect(fingerprinter.fingerprint(PLUGIN_ROOT)).toEqual({
                kind: "refused",
                reason: "unreadable",
                memberDir: PLUGIN,
            });
        });

        it("fits a closure exactly at the limit", () => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme" }, { "a.js": "12345" });
            const manifestBytes = disk.stamp(`${PLUGIN}/package.json`)?.size ?? 0n;
            const exactly: ClosureSize = { entries: 3, bytes: Number(manifestBytes) + 5 };

            expect(
                new PackageClosureFingerprinter(disk, exactly).fingerprint(PLUGIN_ROOT).kind,
            ).toBe("fingerprinted");
        });
    });

    describe("the memo", () => {
        beforeEach(() => {
            install(PLUGIN, { name: "bpmnlint-plugin-acme", dependencies: { dep: "1" } });
            install(`${NODE_MODULES}/dep`, { name: "dep" }, { "a.js": "a", "lib/b.js": "b" });
        });

        it("hashes no file again while every stamp holds", () => {
            const first = contentHashOf();
            const hashedOnce = disk.filesHashed.length;

            expect(contentHashOf()).toBe(first);
            expect(disk.filesHashed).toHaveLength(hashedOnce);
        });

        it("lists no folder again while every stamp holds", () => {
            contentHashOf();
            disk.directoriesListed.length = 0;

            contentHashOf();

            expect(disk.directoriesListed).toEqual([]);
        });

        it("rehashes only a changed file, and the digest follows it", () => {
            const first = contentHashOf();
            disk.filesHashed.length = 0;

            disk.writeFile(`${NODE_MODULES}/dep/lib/b.js`, "changed");

            expect(contentHashOf()).not.toBe(first);
            expect(disk.filesHashed).toEqual([`${NODE_MODULES}/dep/lib/b.js`]);
        });

        it("sees a file added below a folder", () => {
            const first = contentHashOf();

            disk.writeFile(`${NODE_MODULES}/dep/lib/added.js`, "added");

            expect(contentHashOf()).not.toBe(first);
        });

        it("keeps the digest when only a folder's time changed", () => {
            const first = contentHashOf();
            disk.filesHashed.length = 0;

            disk.writeFile(`${NODE_MODULES}/dep/lib/tmp.js`, "t");
            disk.remove(`${NODE_MODULES}/dep/lib/tmp.js`);

            expect(contentHashOf()).toBe(first);
            expect(disk.filesHashed).toEqual([]);
        });

        it("is shared by every closure holding the member", () => {
            const other = `${NODE_MODULES}/bpmnlint-plugin-other`;
            install(other, { name: "bpmnlint-plugin-other", dependencies: { dep: "1" } });
            contentHashOf();
            disk.filesHashed.length = 0;

            contentHashOf({ kind: "package", id: other });

            expect(disk.filesHashed.every((path) => path.startsWith(other))).toBe(true);
            expect(disk.filesHashed).not.toEqual([]);
        });

        it("remembers a package fingerprinted as a root once it is another's member", () => {
            contentHashOf({ kind: "package", id: `${NODE_MODULES}/dep` });
            disk.directoriesListed.length = 0;

            contentHashOf();

            expect(disk.directoriesListed).toEqual([PLUGIN]);
        });

        it("reads the self-package and an installed package at one folder apart", () => {
            install(REPO, { name: "bpmnlint-plugin-self" }, { "order.bpmn": "a" });
            const asSelf = contentHashOf(SELF_ROOT);

            const asPackage = contentHashOf({ kind: "package", id: REPO });

            expect(asPackage).not.toBe(asSelf);
        });
    });

    describe("isUnchanged", () => {
        beforeEach(() => {
            install(PLUGIN, {
                name: "bpmnlint-plugin-acme",
                dependencies: { dep: "1" },
                optionalDependencies: { "@scope/extra": "1" },
            });
            install(`${NODE_MODULES}/dep`, { name: "dep" }, { "lib/b.js": "b" });
        });

        it("holds while nothing changed", () => {
            const { stamps } = fingerprinted();

            expect(fingerprinter.isUnchanged(stamps)).toBe(true);
        });

        it.each<{ case: string; change: () => void }>([
            {
                case: "a member's file changed",
                change: () => disk.writeFile(`${NODE_MODULES}/dep/lib/b.js`, "changed"),
            },
            {
                case: "a member gained a file",
                change: () => disk.writeFile(`${NODE_MODULES}/dep/lib/c.js`, "c"),
            },
            {
                case: "a member folder vanished",
                change: () => disk.remove(`${NODE_MODULES}/dep`),
            },
            {
                case: "a missing optional dependency got installed",
                change: () => install(`${NODE_MODULES}/@scope/extra`, { name: "@scope/extra" }),
            },
            {
                case: "a nearer copy now shadows a hoisted dependency",
                change: () => install(`${PLUGIN}/node_modules/dep`, { name: "dep" }),
            },
        ])("fails once $case", ({ change }) => {
            const { stamps } = fingerprinted();

            change();

            expect(fingerprinter.isUnchanged(stamps)).toBe(false);
        });

        it("reads no file to check", () => {
            const { stamps } = fingerprinted();
            disk.filesHashed.length = 0;

            fingerprinter.isUnchanged(stamps);

            expect(disk.filesHashed).toEqual([]);
        });
    });
});
