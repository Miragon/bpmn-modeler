import { describe, expect, it } from "vitest";

import { buildImportGraph, resolveRelativeImport, unresolvedRelativeImports } from "./importGraph";

describe("resolveRelativeImport", () => {
    const known = new Set([
        "feature/a.ts",
        "feature/b.tsx",
        "feature/c/index.ts",
        "feature/d/index.tsx",
        "feature/e.mjs",
        "feature/f.ts",
        "feature/f/index.ts",
        "shared/g.ts",
    ]);

    it.each([
        { specifier: "./a", resolved: "feature/a.ts" },
        { specifier: "./b", resolved: "feature/b.tsx" },
        { specifier: "./c", resolved: "feature/c/index.ts" },
        { specifier: "./d", resolved: "feature/d/index.tsx" },
        { specifier: "./e.mjs", resolved: "feature/e.mjs" },
        { specifier: "./f", resolved: "feature/f.ts" },
        { specifier: "../shared/g", resolved: "shared/g.ts" },
        { specifier: "./../feature/./a", resolved: "feature/a.ts" },
    ])("resolves $specifier to $resolved", ({ specifier, resolved }) => {
        expect(resolveRelativeImport("feature/view.ts", specifier, known)).toBe(resolved);
    });

    it.each(["./a.js", "./missing", "../../outside"])("leaves %s unresolved", (specifier) => {
        expect(resolveRelativeImport("feature/view.ts", specifier, known)).toBeUndefined();
    });
});

describe("buildImportGraph", () => {
    it("links relative imports to their file and keeps every other import as a specifier", () => {
        const graph = buildImportGraph([
            {
                path: "feature/service/A.ts",
                text: [
                    'import { b } from "../domain/b";',
                    'import type { Lint } from "bpmnlint";',
                    'import "./theme.css";',
                    'import { gone } from "../domain/gone";',
                ].join("\n"),
            },
            { path: "feature/domain/b.ts", text: "export const b = 1;" },
        ]);

        expect(graph).toEqual({
            files: ["feature/service/A.ts", "feature/domain/b.ts"],
            edges: [
                {
                    from: "feature/service/A.ts",
                    specifier: "../domain/b",
                    typeOnly: false,
                    to: "feature/domain/b.ts",
                },
                { from: "feature/service/A.ts", specifier: "bpmnlint", typeOnly: true },
                { from: "feature/service/A.ts", specifier: "./theme.css", typeOnly: false },
                { from: "feature/service/A.ts", specifier: "../domain/gone", typeOnly: false },
            ],
        });
    });
});

describe("unresolvedRelativeImports", () => {
    it("lists relative imports that resolve to nothing, assets aside", () => {
        const graph = buildImportGraph([
            {
                path: "a.ts",
                text: [
                    'import "./b";',
                    'import "./theme.css";',
                    'import data from "./data.json";',
                    'import "./missing";',
                    'import "bpmn-js";',
                ].join("\n"),
            },
            { path: "b.ts", text: "" },
        ]);

        expect(unresolvedRelativeImports(graph, [".css", ".json"])).toEqual([
            { from: "a.ts", specifier: "./missing", typeOnly: false },
        ]);
    });
});
