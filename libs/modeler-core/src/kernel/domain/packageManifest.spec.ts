import { describe, expect, it } from "vitest";

import { manifestPathOf, packageManifestOf, type PackageManifest } from "./packageManifest";

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
        {
            case: "an SPDX license, trimmed",
            manifest: { name: "acme", license: " Apache-2.0 OR MIT " },
            read: { name: "acme", version: "", hasExports: false, license: "Apache-2.0 OR MIT" },
        },
        {
            case: "the type of a legacy license object",
            manifest: { name: "acme", license: { type: "ISC", url: "https://x" } },
            read: { name: "acme", version: "", hasExports: false, license: "ISC" },
        },
        {
            case: "a blank or non-string license as none",
            manifest: { name: "acme", license: ["MIT"] },
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
