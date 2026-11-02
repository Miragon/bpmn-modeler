import {
    buildImportGraph,
    readSourceTree,
    requireMatches,
    roleOf,
} from "@miragon/architecture-testing";
import type { ImportGraph } from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

/**
 * Context isolation for the VS Code host, on top of the shared role-folder
 * rules the repo-level spec applies to every hexagonal workspace. A context
 * reaches another only through `shared/`; the root `composition/` wires them
 * together and is exempt. Import cycles are banned for every workspace in
 * `tools/repo-checks`.
 */
const SUBSTRATE = "shared";

/** Root composition and entries sit in no context. */
function contextOf(path: string): string | undefined {
    const context = roleOf(path)?.context;
    return context === undefined || context === "" ? undefined : context;
}

function crossContextImports({ edges }: ImportGraph): string[] {
    return edges
        .filter(({ from, to }) => {
            const fromContext = contextOf(from);
            const toContext = to === undefined ? undefined : contextOf(to);
            return (
                fromContext !== undefined &&
                toContext !== undefined &&
                toContext !== fromContext &&
                toContext !== SUBSTRATE
            );
        })
        .map(({ from, to }) => `${from} → ${to}`);
}

function importsOf(...specifiers: string[]): string {
    return specifiers.map((specifier) => `import "${specifier}";`).join("\n");
}

describe("context isolation on a synthetic graph", () => {
    const tree = [
        { path: "shared/adapter/out/VsCodeNotifier.ts", text: "" },
        { path: "deployment/adapter/in/DeploymentController.ts", text: "" },
        { path: "diff/adapter/in/BpmnDiffController.ts", text: "" },
        {
            path: "composition/diffFeature.ts",
            text: importsOf(
                "../diff/adapter/in/BpmnDiffController",
                "../deployment/adapter/in/DeploymentController",
            ),
        },
    ];

    it("passes a context that reaches only shared/, and the root composition", () => {
        const graph = buildImportGraph([
            ...tree,
            {
                path: "diff/adapter/in/X.ts",
                text: importsOf("../../../shared/adapter/out/VsCodeNotifier"),
            },
        ]);

        expect(crossContextImports(graph)).toEqual([]);
    });

    it("flags a context that reaches into another", () => {
        const graph = buildImportGraph([
            ...tree,
            {
                path: "diff/adapter/in/X.ts",
                text: importsOf("../../../deployment/adapter/in/DeploymentController"),
            },
        ]);

        expect(crossContextImports(graph)).toEqual([
            "diff/adapter/in/X.ts → deployment/adapter/in/DeploymentController.ts",
        ]);
    });
});

describe("vscode-plugin architecture", () => {
    const graph = buildImportGraph(readSourceTree(__dirname));

    it("a context reaches another context only through shared/", () => {
        requireMatches(
            "contexts",
            graph.files.filter((path) => contextOf(path) !== undefined),
        );
        expect(crossContextImports(graph)).toEqual([]);
    });
});
