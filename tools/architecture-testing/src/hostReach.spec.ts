import { describe, expect, it } from "vitest";

import { filesReaching, isHostModule } from "./hostReach";
import { buildImportGraph } from "./importGraph";

describe("isHostModule", () => {
    it.each(["vscode", "node:fs", "fs", "fs/promises", "http", "https"])(
        "treats %s as a host module",
        (specifier) => {
            expect(isHostModule(specifier)).toBe(true);
        },
    );

    it.each(["path", "@miragon/bpmn-modeler-types", "vscode-uri", "fsevents", "./http"])(
        "does not treat %s as a host module",
        (specifier) => {
            expect(isHostModule(specifier)).toBe(false);
        },
    );
});

describe("filesReaching", () => {
    it("marks every file that reaches a target through resolved imports", () => {
        const graph = buildImportGraph([
            { path: "kernel/infrastructure/FetchHttpClient.ts", text: 'import "node:http";' },
            {
                path: "deployment/DeploymentFeature.ts",
                text: 'import "../kernel/infrastructure/FetchHttpClient";',
            },
            { path: "index.ts", text: 'export * from "./deployment/DeploymentFeature";' },
            { path: "deployment/domain/envRef.ts", text: 'import "path";' },
            { path: "deployment/domain/cycle.ts", text: 'import "./envRef";\nimport "./cycle";' },
        ]);

        expect([...filesReaching(graph, isHostModule)].sort()).toEqual([
            "deployment/DeploymentFeature.ts",
            "index.ts",
            "kernel/infrastructure/FetchHttpClient.ts",
        ]);
    });

    it("ignores a target named only in a comment", () => {
        const graph = buildImportGraph([
            { path: "service/A.ts", text: '// import * as vscode from "vscode";\nexport {};' },
        ]);

        expect(filesReaching(graph, isHostModule)).toEqual(new Set());
    });
});
