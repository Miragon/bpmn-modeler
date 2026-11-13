import { describe, expect, it } from "vitest";

import {
    installedPackageNameOf,
    installedPlaceOf,
    nodeModulesDirOf,
    packageNamePartsOf,
} from "./installedPackagePath";

describe("installedPlaceOf", () => {
    it.each([
        {
            path: "/work/node_modules/bpmnlint-plugin-acme",
            place: { dir: "/work/node_modules", name: "bpmnlint-plugin-acme" },
        },
        {
            path: "/work/node_modules/@acme/bpmnlint-plugin",
            place: { dir: "/work/node_modules", name: "@acme/bpmnlint-plugin" },
        },
        {
            path: "/work/node_modules/@acme/bpmnlint-plugin/lib/index.js",
            place: { dir: "/work/node_modules", name: "@acme/bpmnlint-plugin" },
        },
        {
            path: "/work/node_modules/bpmnlint-plugin-acme/lib/index.js",
            place: { dir: "/work/node_modules", name: "bpmnlint-plugin-acme" },
        },
        {
            path: "/work/node_modules/a/node_modules/bpmnlint-plugin-b",
            place: { dir: "/work/node_modules/a/node_modules", name: "bpmnlint-plugin-b" },
        },
        {
            path: "/work/node_modules/.pnpm/bpmnlint-plugin-b@1.2.0/node_modules/bpmnlint-plugin-b",
            place: {
                dir: "/work/node_modules/.pnpm/bpmnlint-plugin-b@1.2.0/node_modules",
                name: "bpmnlint-plugin-b",
            },
        },
        { path: "/work/node_modules/@acme", place: { dir: "/work/node_modules", name: "" } },
        { path: "/work/node_modules", place: { dir: "/work/node_modules", name: "" } },
        { path: "/work/packages/rules", place: undefined },
    ])("places $path", ({ path, place }) => {
        expect(installedPlaceOf(path)).toEqual(place);
    });
});

describe("installedPackageNameOf", () => {
    it.each([
        { id: "/work/node_modules/bpmnlint-plugin-acme", name: "bpmnlint-plugin-acme" },
        { id: "/work/node_modules/@acme/bpmnlint-plugin", name: "@acme/bpmnlint-plugin" },
        { id: "node_modules/@acme/rules", name: "@acme/rules" },
        { id: "/work/packages/rules", name: "rules" },
    ])("names $id $name", ({ id, name }) => {
        expect(installedPackageNameOf(id)).toBe(name);
    });
});

describe("packageNamePartsOf", () => {
    it.each([
        { parts: ["acme", "lib"], name: ["acme"] },
        { parts: ["@acme", "rules", "lib"], name: ["@acme", "rules"] },
        { parts: ["@acme"], name: undefined },
        { parts: [], name: undefined },
    ])("takes $name from $parts", ({ parts, name }) => {
        expect(packageNamePartsOf(parts)).toEqual(name);
    });
});

describe("nodeModulesDirOf", () => {
    it("names the node_modules a folder installs its packages in", () => {
        expect(nodeModulesDirOf("/work/orders")).toBe("/work/orders/node_modules");
    });
});
