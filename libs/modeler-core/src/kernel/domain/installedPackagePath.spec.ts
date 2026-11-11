import { describe, expect, it } from "vitest";

import { installedPackageNameOf } from "./installedPackagePath";

describe("installedPackageNameOf", () => {
    it.each([
        { id: "/work/node_modules/bpmnlint-plugin-acme", name: "bpmnlint-plugin-acme" },
        { id: "/work/node_modules/@acme/bpmnlint-plugin", name: "@acme/bpmnlint-plugin" },
        { id: "/work/node_modules/a/node_modules/bpmnlint-plugin-b", name: "bpmnlint-plugin-b" },
        {
            id: "/work/node_modules/.pnpm/bpmnlint-plugin-b@1.2.0/node_modules/bpmnlint-plugin-b",
            name: "bpmnlint-plugin-b",
        },
        { id: "node_modules/@acme/rules", name: "@acme/rules" },
        { id: "/work/packages/rules", name: "rules" },
    ])("names $id $name", ({ id, name }) => {
        expect(installedPackageNameOf(id)).toBe(name);
    });
});
