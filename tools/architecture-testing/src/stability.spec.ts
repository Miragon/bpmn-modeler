import { describe, expect, it } from "vitest";

import { findImportCycles } from "./importCycles";
import {
    describeDependency,
    instability,
    unstableDependencies,
    workspaceDependencies,
} from "./stability";

const workspaces = [
    { name: "@scope/types", dir: "libs/types" },
    { name: "@scope/core", dir: "libs/core" },
    { name: "@scope/package", dir: "packages/package" },
    { name: "app", dir: "apps/app" },
];

describe("workspaceDependencies", () => {
    it("maps package imports to one sorted edge per workspace pair", () => {
        const dependencies = workspaceDependencies(
            new Map([
                ["apps/app", ["@scope/package/design", "@scope/core", "@scope/package", "vscode"]],
                ["libs/core", ["@scope/types", "@scope/core/testing", "./local"]],
                ["libs/types", []],
            ]),
            workspaces,
        );

        expect(dependencies).toEqual([
            { from: "apps/app", to: "libs/core" },
            { from: "apps/app", to: "packages/package" },
            { from: "libs/core", to: "libs/types" },
        ]);
    });
});

describe("instability", () => {
    it("counts afferent and efferent workspaces", () => {
        const stability = instability([
            { from: "apps/app", to: "libs/core" },
            { from: "apps/app", to: "libs/types" },
            { from: "libs/core", to: "libs/types" },
        ]);

        expect(Object.fromEntries(stability)).toEqual({
            "apps/app": { afferent: 0, efferent: 2, instability: 1 },
            "libs/core": { afferent: 1, efferent: 1, instability: 0.5 },
            "libs/types": { afferent: 2, efferent: 0, instability: 0 },
        });
    });
});

describe("unstableDependencies", () => {
    it("passes a graph where every dependency points to a more stable workspace", () => {
        expect(
            unstableDependencies([
                { from: "apps/app", to: "libs/core" },
                { from: "apps/app", to: "libs/types" },
                { from: "libs/core", to: "libs/types" },
            ]),
        ).toEqual([]);
    });

    it("flags a stable workspace that imports a less stable one", () => {
        const dependencies = [
            { from: "apps/app", to: "libs/types" },
            { from: "libs/core", to: "libs/types" },
            { from: "libs/types", to: "packages/package" },
            { from: "packages/package", to: "libs/core" },
            { from: "packages/package", to: "apps/other" },
        ];

        const unstable = unstableDependencies(dependencies);

        expect(unstable).toEqual([{ from: "libs/types", to: "packages/package" }]);
        expect(describeDependency(unstable[0], instability(dependencies))).toBe(
            "libs/types (I=0.33) → packages/package (I=0.67)",
        );
    });

    it("passes a dependency between workspaces of equal instability", () => {
        expect(
            unstableDependencies([
                { from: "libs/a", to: "libs/b" },
                { from: "libs/b", to: "libs/a" },
            ]),
        ).toEqual([]);
    });
});

describe("workspace cycles", () => {
    it("finds two workspaces that import each other, which the stability rule alone passes", () => {
        const dependencies = workspaceDependencies(
            new Map([
                ["libs/core", ["@scope/types"]],
                ["libs/types", ["@scope/core"]],
            ]),
            workspaces,
        );

        expect(unstableDependencies(dependencies)).toEqual([]);
        expect(findImportCycles(dependencies)).toEqual([["libs/core", "libs/types"]]);
    });
});
