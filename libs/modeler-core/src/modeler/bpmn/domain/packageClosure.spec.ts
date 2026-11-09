import { describe, expect, it } from "vitest";

import {
    CLOSURE_SIZE_LIMIT,
    type DependencyCandidate,
    dependencyCandidates,
    type DependencyLookup,
    dependencyLookupOf,
    type DependencyProbe,
    dependencyProbeOf,
    type DependencyProbeStamps,
    exceedsClosureSizeLimit,
    type FingerprintedRoot,
    type InstalledEntryKind,
    isExcludedMemberEntry,
    isHashedMemberFile,
    isLinkInsideMember,
    type MemberKind,
    packageManifestOf,
    type PackageManifest,
    type PathStamp,
    samePathStamp,
    InstalledEntry,
    rulePackageFolderNames,
    rulePackageScopesToList,
} from "./packageClosure";

const STAMP: PathStamp = {
    kind: "file",
    dev: 1n,
    ino: 2n,
    size: 3n,
    mtimeNs: 4n,
    ctimeNs: 5n,
};

describe("samePathStamp", () => {
    it.each<{ case: string; other: PathStamp | undefined; same: boolean }>([
        { case: "an equal stamp", other: { ...STAMP }, same: true },
        { case: "another kind", other: { ...STAMP, kind: "directory" }, same: false },
        { case: "another device", other: { ...STAMP, dev: 9n }, same: false },
        { case: "another inode", other: { ...STAMP, ino: 9n }, same: false },
        { case: "another size", other: { ...STAMP, size: 9n }, same: false },
        { case: "another modification time", other: { ...STAMP, mtimeNs: 9n }, same: false },
        { case: "another change time", other: { ...STAMP, ctimeNs: 9n }, same: false },
        { case: "nothing there now", other: undefined, same: false },
    ])("compares a stamp with $case: $same", ({ other, same }) => {
        expect(samePathStamp(STAMP, other)).toBe(same);
        expect(samePathStamp(other, STAMP)).toBe(same);
    });

    it("takes nothing there before and after for unchanged", () => {
        expect(samePathStamp(undefined, undefined)).toBe(true);
    });
});

describe("packageManifestOf", () => {
    it.each<{ case: string; manifest: unknown; read: PackageManifest }>([
        {
            case: "dependencies, optional and peer dependencies, sorted by name",
            manifest: {
                name: "bpmnlint-plugin-acme",
                version: "1.2.3",
                dependencies: { "min-dash": "^4", "@bpmn-io/moddle-utils": "^1" },
                optionalDependencies: { fsevents: "^2" },
                peerDependencies: { bpmnlint: ">=11" },
            },
            read: {
                name: "bpmnlint-plugin-acme",
                version: "1.2.3",
                dependencies: ["@bpmn-io/moddle-utils", "bpmnlint", "fsevents", "min-dash"],
            },
        },
        {
            case: "a name listed as dependency, optional and peer once",
            manifest: {
                name: "a",
                version: "1.0.0",
                dependencies: { shared: "1" },
                peerDependencies: { shared: "1" },
                optionalDependencies: { shared: "1" },
            },
            read: {
                name: "a",
                version: "1.0.0",
                dependencies: ["shared"],
            },
        },
        {
            case: "dev dependencies left out, as they are not installed for a dependent",
            manifest: { name: "a", version: "1.0.0", devDependencies: { vitest: "1" } },
            read: { name: "a", version: "1.0.0", dependencies: [] },
        },
        {
            case: "a missing name and version as empty",
            manifest: {},
            read: { name: "", version: "", dependencies: [] },
        },
        {
            case: "a name and version that are not strings as empty",
            manifest: { name: 7, version: ["1"], dependencies: "min-dash" },
            read: { name: "", version: "", dependencies: [] },
        },
        {
            case: "dependency names that would leave node_modules dropped",
            manifest: {
                name: "a",
                version: "1",
                dependencies: {
                    "../evil": "1",
                    "/abs": "1",
                    "@scope": "1",
                    "@scope/..": "1",
                    "a/b": "1",
                    "@scope/name/sub": "1",
                    "@scope/name": "1",
                    "ok": "1",
                },
            },
            read: {
                name: "a",
                version: "1",
                dependencies: ["@scope/name", "ok"],
            },
        },
    ])("reads $case", ({ manifest, read }) => {
        expect(packageManifestOf(JSON.stringify(manifest))).toEqual(read);
    });

    it.each(["{", "", "null", "[]", '"text"', "42"])("reads nothing from %j", (text) => {
        expect(packageManifestOf(text)).toBeUndefined();
    });
});

describe("dependencyCandidates", () => {
    it.each<{ case: string; fromDir: string; name: string; candidates: DependencyCandidate[] }>([
        {
            case: "every ancestor's node_modules, nearest first",
            fromDir: "/repo/node_modules/bpmnlint-plugin-acme",
            name: "min-dash",
            candidates: [
                {
                    packageDir: "/repo/node_modules/bpmnlint-plugin-acme/node_modules/min-dash",
                    watchedDirs: ["/repo/node_modules/bpmnlint-plugin-acme/node_modules"],
                },
                {
                    packageDir: "/repo/node_modules/min-dash",
                    watchedDirs: ["/repo/node_modules"],
                },
                { packageDir: "/node_modules/min-dash", watchedDirs: ["/node_modules"] },
            ],
        },
        {
            case: "a scoped name, watching its scope folder too",
            fromDir: "/repo/node_modules/@acme/bpmnlint-plugin-rules",
            name: "@bpmn-io/feel",
            candidates: [
                {
                    packageDir:
                        "/repo/node_modules/@acme/bpmnlint-plugin-rules/node_modules/@bpmn-io/feel",
                    watchedDirs: [
                        "/repo/node_modules/@acme/bpmnlint-plugin-rules/node_modules",
                        "/repo/node_modules/@acme/bpmnlint-plugin-rules/node_modules/@bpmn-io",
                    ],
                },
                {
                    packageDir: "/repo/node_modules/@acme/node_modules/@bpmn-io/feel",
                    watchedDirs: [
                        "/repo/node_modules/@acme/node_modules",
                        "/repo/node_modules/@acme/node_modules/@bpmn-io",
                    ],
                },
                {
                    packageDir: "/repo/node_modules/@bpmn-io/feel",
                    watchedDirs: ["/repo/node_modules", "/repo/node_modules/@bpmn-io"],
                },
                {
                    packageDir: "/node_modules/@bpmn-io/feel",
                    watchedDirs: ["/node_modules", "/node_modules/@bpmn-io"],
                },
            ],
        },
        {
            case: "a pnpm store path, finding the siblings first",
            fromDir: "/repo/node_modules/.pnpm/a@1.0.0/node_modules/a",
            name: "b",
            candidates: [
                {
                    packageDir: "/repo/node_modules/.pnpm/a@1.0.0/node_modules/a/node_modules/b",
                    watchedDirs: ["/repo/node_modules/.pnpm/a@1.0.0/node_modules/a/node_modules"],
                },
                {
                    packageDir: "/repo/node_modules/.pnpm/a@1.0.0/node_modules/b",
                    watchedDirs: ["/repo/node_modules/.pnpm/a@1.0.0/node_modules"],
                },
                {
                    packageDir: "/repo/node_modules/.pnpm/node_modules/b",
                    watchedDirs: ["/repo/node_modules/.pnpm/node_modules"],
                },
                { packageDir: "/repo/node_modules/b", watchedDirs: ["/repo/node_modules"] },
                { packageDir: "/node_modules/b", watchedDirs: ["/node_modules"] },
            ],
        },
        {
            case: "a Windows drive, stopping at its root",
            fromDir: "C:/repo",
            name: "a",
            candidates: [
                { packageDir: "C:/repo/node_modules/a", watchedDirs: ["C:/repo/node_modules"] },
                { packageDir: "C:/node_modules/a", watchedDirs: ["C:/node_modules"] },
            ],
        },
    ])("looks a dependency up in $case", ({ fromDir, name, candidates }) => {
        expect(dependencyCandidates(fromDir, name)).toEqual(candidates);
    });
});

describe("dependencyProbeOf", () => {
    it.each<{ case: string; packageDir: string; probe: DependencyProbe }>([
        {
            case: "a plain name",
            packageDir: "/repo/node_modules/dep",
            probe: {
                files: [
                    "/repo/node_modules/dep",
                    "/repo/node_modules/dep.js",
                    "/repo/node_modules/dep.json",
                    "/repo/node_modules/dep.node",
                ],
                manifest: "/repo/node_modules/dep/package.json",
                indexFiles: [
                    "/repo/node_modules/dep/index.js",
                    "/repo/node_modules/dep/index.json",
                    "/repo/node_modules/dep/index.node",
                ],
            },
        },
        {
            case: "a scoped name",
            packageDir: "/repo/node_modules/@s/dep",
            probe: {
                files: [
                    "/repo/node_modules/@s/dep",
                    "/repo/node_modules/@s/dep.js",
                    "/repo/node_modules/@s/dep.json",
                    "/repo/node_modules/@s/dep.node",
                ],
                manifest: "/repo/node_modules/@s/dep/package.json",
                indexFiles: [
                    "/repo/node_modules/@s/dep/index.js",
                    "/repo/node_modules/@s/dep/index.json",
                    "/repo/node_modules/@s/dep/index.node",
                ],
            },
        },
    ])("looks where Node looks for $case", ({ packageDir, probe }) => {
        expect(dependencyProbeOf(packageDir)).toEqual(probe);
    });
});

describe("dependencyLookupOf", () => {
    const file: PathStamp = STAMP;
    const directory: PathStamp = { ...STAMP, kind: "directory" };
    const other: PathStamp = { ...STAMP, kind: "other" };
    const none = [undefined, undefined, undefined, undefined];

    it.each<{ case: string; found: DependencyProbeStamps; lookup: DependencyLookup }>([
        {
            case: "a folder with a manifest",
            found: { files: [directory, ...none.slice(1)], manifest: file, indexFiles: none },
            lookup: "package",
        },
        {
            case: "a folder with a manifest and an index",
            found: { files: [directory], manifest: file, indexFiles: [file] },
            lookup: "package",
        },
        {
            case: "nothing",
            found: { files: none, manifest: undefined, indexFiles: none },
            lookup: "absent",
        },
        {
            case: "a folder with neither manifest nor index",
            found: { files: [directory], manifest: undefined, indexFiles: none },
            lookup: "absent",
        },
        {
            case: "a folder whose manifest is a folder",
            found: { files: [directory], manifest: directory, indexFiles: [directory] },
            lookup: "absent",
        },
        {
            case: "a folder named like a file form",
            found: { files: [undefined, directory], manifest: undefined, indexFiles: none },
            lookup: "absent",
        },
        {
            case: "a special file named like the dependency",
            found: { files: [other], manifest: undefined, indexFiles: none },
            lookup: "absent",
        },
        {
            case: "a file named like the dependency",
            found: { files: [file], manifest: undefined, indexFiles: none },
            lookup: "unsupportedLayout",
        },
        {
            case: "a file form beside a folder with a manifest",
            found: {
                files: [directory, undefined, undefined, file],
                manifest: file,
                indexFiles: none,
            },
            lookup: "unsupportedLayout",
        },
        {
            case: "a folder with an index and no manifest",
            found: {
                files: [directory],
                manifest: undefined,
                indexFiles: [undefined, undefined, file],
            },
            lookup: "unsupportedLayout",
        },
    ])("finds $case: $lookup", ({ found, lookup }) => {
        expect(dependencyLookupOf(found)).toBe(lookup);
    });
});

describe("isExcludedMemberEntry", () => {
    it.each<{
        relPath: string;
        entryKind: InstalledEntryKind;
        kind: MemberKind;
        excluded: boolean;
    }>([
        { relPath: "node_modules", entryKind: "directory", kind: "package", excluded: true },
        { relPath: "node_modules", entryKind: "symbolicLink", kind: "package", excluded: true },
        { relPath: ".git", entryKind: "directory", kind: "package", excluded: true },
        { relPath: ".git", entryKind: "file", kind: "package", excluded: true },
        { relPath: "lib/node_modules", entryKind: "directory", kind: "package", excluded: false },
        { relPath: "lib/.git", entryKind: "directory", kind: "package", excluded: false },
        { relPath: "index.js", entryKind: "file", kind: "package", excluded: false },
        { relPath: "test/order.bpmn", entryKind: "file", kind: "package", excluded: false },
        { relPath: ".bpmnlintrc", entryKind: "file", kind: "package", excluded: false },
        { relPath: "node_modules", entryKind: "directory", kind: "selfPackage", excluded: true },
        { relPath: ".git", entryKind: "directory", kind: "selfPackage", excluded: true },
        { relPath: "order.bpmn", entryKind: "file", kind: "selfPackage", excluded: true },
        {
            relPath: "processes/order.bpmn",
            entryKind: "file",
            kind: "selfPackage",
            excluded: true,
        },
        { relPath: "decisions/route.dmn", entryKind: "file", kind: "selfPackage", excluded: true },
        { relPath: "forms/start.form", entryKind: "file", kind: "selfPackage", excluded: true },
        { relPath: ".bpmnlintrc", entryKind: "file", kind: "selfPackage", excluded: true },
        { relPath: "sub/.bpmnlintrc", entryKind: "file", kind: "selfPackage", excluded: true },
        { relPath: "rules.bpmn", entryKind: "directory", kind: "selfPackage", excluded: false },
        { relPath: "lib.form", entryKind: "symbolicLink", kind: "selfPackage", excluded: false },
        { relPath: "pipe.dmn", entryKind: "other", kind: "selfPackage", excluded: false },
        { relPath: "order.bpmn.js", entryKind: "file", kind: "selfPackage", excluded: false },
        { relPath: "bpmn", entryKind: "file", kind: "selfPackage", excluded: false },
        { relPath: ".bpmnlintrc.js", entryKind: "file", kind: "selfPackage", excluded: false },
        { relPath: "rules/label.js", entryKind: "file", kind: "selfPackage", excluded: false },
    ])(
        "excludes the $entryKind $relPath from a $kind: $excluded",
        ({ relPath, entryKind, kind, excluded }) => {
            expect(isExcludedMemberEntry(relPath, entryKind, kind)).toBe(excluded);
        },
    );
});

describe("isHashedMemberFile", () => {
    const PACKAGE = "/w/node_modules/bpmnlint-plugin-acme";
    const SELF = "/w";

    it.each<{ case: string; file: string; root: FingerprintedRoot; hashed: boolean }>([
        {
            case: "a package's own file",
            file: `${PACKAGE}/rules/a.js`,
            root: { kind: "package", id: PACKAGE },
            hashed: true,
        },
        {
            case: "a file under a package's .git",
            file: `${PACKAGE}/.git/evil.js`,
            root: { kind: "package", id: PACKAGE },
            hashed: false,
        },
        {
            case: "a file deep under a package's .git",
            file: `${PACKAGE}/.git/hooks/evil.js`,
            root: { kind: "package", id: PACKAGE },
            hashed: false,
        },
        {
            case: "a file under a package's own node_modules",
            file: `${PACKAGE}/node_modules/x.js`,
            root: { kind: "package", id: PACKAGE },
            hashed: false,
        },
        {
            case: "a file under a nested .git",
            file: `${PACKAGE}/lib/.git/a.js`,
            root: { kind: "package", id: PACKAGE },
            hashed: true,
        },
        {
            case: "a model file of a package",
            file: `${PACKAGE}/evil.bpmn`,
            root: { kind: "package", id: PACKAGE },
            hashed: true,
        },
        {
            case: "a model file of the self-package",
            file: `${SELF}/evil.bpmn`,
            root: { kind: "selfPackage", id: SELF },
            hashed: false,
        },
        {
            case: "a nested model file of the self-package",
            file: `${SELF}/rules/evil.form`,
            root: { kind: "selfPackage", id: SELF },
            hashed: false,
        },
        {
            case: "the self-package's config",
            file: `${SELF}/.bpmnlintrc`,
            root: { kind: "selfPackage", id: SELF },
            hashed: false,
        },
        {
            case: "a file in a self-package folder named like a model",
            file: `${SELF}/rules.bpmn/index.js`,
            root: { kind: "selfPackage", id: SELF },
            hashed: true,
        },
        {
            case: "a file under the self-package's .git",
            file: `${SELF}/.git/evil.js`,
            root: { kind: "selfPackage", id: SELF },
            hashed: false,
        },
        {
            case: "a file outside the member",
            file: "/w/scripts/evil.js",
            root: { kind: "package", id: PACKAGE },
            hashed: false,
        },
    ])("takes $case as hashed: $hashed", ({ file, root, hashed }) => {
        expect(isHashedMemberFile(file, root)).toBe(hashed);
    });
});

describe("isLinkInsideMember", () => {
    const file: PathStamp = STAMP;
    const directory: PathStamp = { ...STAMP, kind: "directory" };

    it.each<{
        case: string;
        target: string | undefined;
        targetStamp: PathStamp | undefined;
        inside: boolean;
    }>([
        { case: "a file inside", target: "/m/lib/a.js", targetStamp: file, inside: true },
        { case: "a file outside", target: "/elsewhere/a.js", targetStamp: file, inside: false },
        { case: "a sibling folder's file", target: "/m2/a.js", targetStamp: file, inside: false },
        { case: "a directory inside", target: "/m/lib", targetStamp: directory, inside: false },
        { case: "the member folder", target: "/m", targetStamp: directory, inside: false },
        { case: "nothing", target: undefined, targetStamp: undefined, inside: false },
        {
            case: "a target gone before its realpath",
            target: undefined,
            targetStamp: file,
            inside: false,
        },
        { case: "a vanished target", target: "/m/a.js", targetStamp: undefined, inside: false },
    ])("lets a link to $case stay: $inside", ({ target, targetStamp, inside }) => {
        expect(isLinkInsideMember(target, targetStamp, "/m")).toBe(inside);
    });
});

describe("exceedsClosureSizeLimit", () => {
    const { entries, bytes } = CLOSURE_SIZE_LIMIT;

    it.each<{ case: string; totals: { entries: number; bytes: number }; exceeds: boolean }>([
        { case: "an empty closure", totals: { entries: 0, bytes: 0 }, exceeds: false },
        { case: "exactly the limit", totals: { entries, bytes }, exceeds: false },
        { case: "one entry more", totals: { entries: entries + 1, bytes: 0 }, exceeds: true },
        { case: "one byte more", totals: { entries: 0, bytes: bytes + 1 }, exceeds: true },
    ])("measures $case: $exceeds", ({ totals, exceeds }) => {
        expect(exceedsClosureSizeLimit(totals)).toBe(exceeds);
    });

    it("leaves room for about eight times the largest closure measured", () => {
        expect(CLOSURE_SIZE_LIMIT).toEqual({ entries: 5000, bytes: 50 * 1024 * 1024 });
    });

    it("takes a given limit", () => {
        expect(exceedsClosureSizeLimit({ entries: 3, bytes: 0 }, { entries: 2, bytes: 9 })).toBe(
            true,
        );
    });
});

describe("rulePackageFolderNames", () => {
    const entry = (name: string, kind: InstalledEntry["kind"] = "directory"): InstalledEntry => ({
        name,
        kind,
    });

    it("lists the scopes to look into, never a scope that is a file", () => {
        expect(
            rulePackageScopesToList([
                entry("@acme"),
                entry("@linked", "symbolicLink"),
                entry("@file", "file"),
                entry("bpmnlint-plugin-acme"),
            ]),
        ).toEqual(["@acme", "@linked"]);
    });

    it.each<{
        case: string;
        entries: InstalledEntry[];
        scoped: [string, InstalledEntry[]][];
        names: string[];
    }>([
        {
            case: "rule packages by the name bpmnlint resolves a plugin to",
            entries: [entry("bpmnlint-plugin-acme"), entry("bpmnlint-plugin"), entry("bpmnlint")],
            scoped: [],
            names: ["bpmnlint-plugin", "bpmnlint-plugin-acme"],
        },
        {
            case: "a linked package, as pnpm and yarn install one",
            entries: [entry("bpmnlint-plugin-linked", "symbolicLink")],
            scoped: [],
            names: ["bpmnlint-plugin-linked"],
        },
        {
            case: "no file and no name that only looks alike",
            entries: [
                entry("bpmnlint-plugin-file", "file"),
                entry("my-bpmnlint-plugin-acme"),
                entry("bpmnlint-pluginacme"),
                entry("bpmnlint-plugin-other", "other"),
            ],
            scoped: [],
            names: [],
        },
        {
            case: "scoped rule packages below their scope",
            entries: [entry("@acme")],
            scoped: [
                [
                    "@acme",
                    [entry("bpmnlint-plugin"), entry("bpmnlint-plugin-rules"), entry("utils")],
                ],
            ],
            names: ["@acme/bpmnlint-plugin", "@acme/bpmnlint-plugin-rules"],
        },
    ])("finds $case", ({ entries, scoped, names }) => {
        expect(rulePackageFolderNames(entries, new Map(scoped))).toEqual(names);
    });
});
