import { describe, expect, it } from "vitest";

import {
    type DependencyCandidate,
    dependencyCandidates,
    manifestPathOf,
    packageManifestOf,
    type PackageManifest,
    type PathStamp,
    samePathStamp,
    InstalledEntry,
    rulePackageFolderNames,
    rulePackageScopesToList,
} from "./installedPackage";

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
            case: "its name and version, and nothing of its dependencies",
            manifest: {
                name: "bpmnlint-plugin-acme",
                version: "1.2.3",
                dependencies: { "min-dash": "^4" },
            },
            read: { name: "bpmnlint-plugin-acme", version: "1.2.3", hasExports: false },
        },
        {
            case: "a missing name and version as empty",
            manifest: {},
            read: { name: "", version: "", hasExports: false },
        },
        {
            case: "a name and version that are not strings as empty",
            manifest: { name: 7, version: ["1"] },
            read: { name: "", version: "", hasExports: false },
        },
        {
            case: "an exports map",
            manifest: { name: "acme", exports: { "./rules/*": "./src/rules/*.js" } },
            read: { name: "acme", version: "", hasExports: true },
        },
        {
            case: "an exports string",
            manifest: { name: "acme", exports: "./index.js" },
            read: { name: "acme", version: "", hasExports: true },
        },
        {
            case: "exports set to null as none, as Node reads it",
            manifest: { name: "acme", exports: null },
            read: { name: "acme", version: "", hasExports: false },
        },
    ])("reads $case", ({ manifest, read }) => {
        expect(packageManifestOf(JSON.stringify(manifest))).toEqual(read);
    });

    it.each(["{", "", "null", "[]", '"text"', "42"])("reads nothing from %j", (text) => {
        expect(packageManifestOf(text)).toBeUndefined();
    });
});

describe("manifestPathOf", () => {
    it.each([
        { dir: "/repo/node_modules/acme", path: "/repo/node_modules/acme/package.json" },
        { dir: "C:/repo", path: "C:/repo/package.json" },
    ])("names the package.json in $dir", ({ dir, path }) => {
        expect(manifestPathOf(dir)).toBe(path);
    });
});

describe("dependencyCandidates", () => {
    it.each<{ case: string; fromDir: string; name: string; candidates: DependencyCandidate[] }>([
        {
            case: "every ancestor's node_modules, nearest first",
            fromDir: "/repo/node_modules/bpmnlint-plugin-acme",
            name: "min-dash",
            candidates: [
                { packageDir: "/repo/node_modules/bpmnlint-plugin-acme/node_modules/min-dash" },
                { packageDir: "/repo/node_modules/min-dash" },
                { packageDir: "/node_modules/min-dash" },
            ],
        },
        {
            case: "a scoped name",
            fromDir: "/repo/node_modules/@acme/bpmnlint-plugin-rules",
            name: "@bpmn-io/feel",
            candidates: [
                {
                    packageDir:
                        "/repo/node_modules/@acme/bpmnlint-plugin-rules/node_modules/@bpmn-io/feel",
                },
                { packageDir: "/repo/node_modules/@acme/node_modules/@bpmn-io/feel" },
                { packageDir: "/repo/node_modules/@bpmn-io/feel" },
                { packageDir: "/node_modules/@bpmn-io/feel" },
            ],
        },
        {
            case: "a pnpm store path, finding the siblings first",
            fromDir: "/repo/node_modules/.pnpm/a@1.0.0/node_modules/a",
            name: "b",
            candidates: [
                { packageDir: "/repo/node_modules/.pnpm/a@1.0.0/node_modules/a/node_modules/b" },
                { packageDir: "/repo/node_modules/.pnpm/a@1.0.0/node_modules/b" },
                { packageDir: "/repo/node_modules/.pnpm/node_modules/b" },
                { packageDir: "/repo/node_modules/b" },
                { packageDir: "/node_modules/b" },
            ],
        },
        {
            case: "a Windows drive, stopping at its root",
            fromDir: "C:/repo",
            name: "a",
            candidates: [
                { packageDir: "C:/repo/node_modules/a" },
                { packageDir: "C:/node_modules/a" },
            ],
        },
    ])("looks a dependency up in $case", ({ fromDir, name, candidates }) => {
        expect(dependencyCandidates(fromDir, name)).toEqual(candidates);
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
