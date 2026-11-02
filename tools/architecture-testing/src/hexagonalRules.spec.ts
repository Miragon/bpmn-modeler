import { describe, expect, it } from "vitest";

import { HEXAGONAL_RULES } from "./hexagonalRules";
import { buildImportGraph } from "./importGraph";
import type { Violation } from "./knownExceptions";
import type { SourceFile } from "./sourceTree";

function importsOf(...specifiers: string[]): string {
    return specifiers.map((specifier) => `import "${specifier}";`).join("\n");
}

/** Every import here is allowed by every rule. */
const CORRECT_TREE: readonly SourceFile[] = [
    { path: "index.ts", text: 'export * from "./deployment/service/DeploymentService";' },
    { path: "main.ts", text: importsOf("./composition/activate") },
    {
        path: "composition/activate.ts",
        text: importsOf(
            "vscode",
            "../deployment/composition/DeploymentFeature",
            "../deployment/adapter/out/VsCodeSettings",
        ),
    },
    {
        path: "deployment/composition/DeploymentFeature.ts",
        text: importsOf(
            "../service/DeploymentService",
            "../adapter/in/deploymentMessageHandlers",
            "../adapter/out/camunda/Camunda7RestClient",
        ),
    },
    {
        path: "deployment/domain/deploymentTarget.ts",
        text: importsOf("../../kernel/domain/errors", "path"),
    },
    { path: "kernel/domain/errors.ts", text: "" },
    { path: "deployment/port/DeploymentClient.ts", text: importsOf("../domain/deploymentTarget") },
    { path: "kernel/port/Settings.ts", text: importsOf("../domain/errors") },
    {
        path: "deployment/port/DeploymentSettings.ts",
        text: importsOf("../../kernel/port/Settings"),
    },
    {
        path: "deployment/service/DeploymentService.ts",
        text: importsOf(
            "../domain/deploymentTarget",
            "../port/DeploymentClient",
            "../../kernel/service/ArtifactService",
        ),
    },
    { path: "kernel/service/ArtifactService.ts", text: "" },
    {
        path: "deployment/adapter/in/deploymentMessageHandlers.ts",
        text: importsOf("../../service/DeploymentService", "vscode"),
    },
    {
        path: "deployment/adapter/out/camunda/Camunda7RestClient.ts",
        text: importsOf("../../../port/DeploymentClient", "node:http"),
    },
    { path: "deployment/adapter/out/VsCodeSettings.ts", text: importsOf("vscode") },
    {
        path: "testing/createTestHost.ts",
        text: importsOf("../deployment/service/DeploymentService"),
    },
    { path: "testing/index.ts", text: 'export * from "./createTestHost";' },
];

function violationsOf(tree: readonly SourceFile[]): Record<string, Violation[]> {
    const graph = buildImportGraph(tree);
    return Object.fromEntries(
        HEXAGONAL_RULES.map(({ rule, violations }) => [rule, violations(graph)]),
    );
}

function withFile(path: string, text: string): SourceFile[] {
    return [...CORRECT_TREE, { path, text }];
}

describe("HEXAGONAL_RULES", () => {
    it("pass a tree that keeps every role in its folder", () => {
        expect(Object.values(violationsOf(CORRECT_TREE)).flat()).toEqual([]);
    });

    it.each([
        {
            name: "a file outside every role folder",
            tree: withFile("deployment/helpers/format.ts", ""),
            violations: [{ from: "deployment/helpers/format.ts", to: "(no role folder)" }],
        },
        {
            name: "an adapter folder that is neither in nor out",
            tree: withFile("deployment/adapter/format.ts", ""),
            violations: [{ from: "deployment/adapter/format.ts", to: "(no role folder)" }],
        },
        {
            name: "domain importing a port",
            tree: withFile("deployment/domain/x.ts", importsOf("../port/DeploymentClient")),
            violations: [
                { from: "deployment/domain/x.ts", to: "deployment/port/DeploymentClient.ts" },
            ],
        },
        {
            name: "domain importing vscode",
            tree: withFile("deployment/domain/x.ts", importsOf("vscode")),
            violations: [{ from: "deployment/domain/x.ts", to: "vscode" }],
        },
        {
            name: "a port importing a service",
            tree: withFile("deployment/port/X.ts", importsOf("../service/DeploymentService")),
            violations: [
                { from: "deployment/port/X.ts", to: "deployment/service/DeploymentService.ts" },
                { from: "deployment/port/X.ts", to: "deployment/service/DeploymentService.ts" },
            ],
        },
        {
            name: "a service importing an adapter",
            tree: withFile("deployment/service/X.ts", importsOf("../adapter/out/VsCodeSettings")),
            violations: [
                {
                    from: "deployment/service/X.ts",
                    to: "deployment/adapter/out/VsCodeSettings.ts",
                },
            ],
        },
        {
            name: "a service importing the test kit",
            tree: withFile("deployment/service/X.ts", importsOf("../../testing/createTestHost")),
            violations: [
                { from: "deployment/service/X.ts", to: "testing/createTestHost.ts" },
                { from: "deployment/service/X.ts", to: "testing/createTestHost.ts" },
            ],
        },
        {
            name: "an outbound adapter importing a service",
            tree: withFile(
                "deployment/adapter/out/X.ts",
                importsOf("../../service/DeploymentService"),
            ),
            violations: [
                {
                    from: "deployment/adapter/out/X.ts",
                    to: "deployment/service/DeploymentService.ts",
                },
            ],
        },
        {
            name: "an inbound adapter importing an outbound adapter",
            tree: withFile("deployment/adapter/in/X.ts", importsOf("../out/VsCodeSettings")),
            violations: [
                {
                    from: "deployment/adapter/in/X.ts",
                    to: "deployment/adapter/out/VsCodeSettings.ts",
                },
            ],
        },
        {
            name: "an outbound adapter importing an inbound adapter in another context",
            tree: withFile(
                "kernel/adapter/out/X.ts",
                importsOf("../../../deployment/adapter/in/deploymentMessageHandlers"),
            ),
            violations: [
                {
                    from: "kernel/adapter/out/X.ts",
                    to: "deployment/adapter/in/deploymentMessageHandlers.ts",
                },
            ],
        },
        {
            name: "a service importing node:fs",
            tree: withFile("deployment/service/X.ts", importsOf("node:fs")),
            violations: [{ from: "deployment/service/X.ts", to: "node:fs" }],
        },
        {
            name: "an adapter importing composition",
            tree: withFile(
                "deployment/adapter/in/X.ts",
                importsOf("../../composition/DeploymentFeature"),
            ),
            violations: [
                {
                    from: "deployment/adapter/in/X.ts",
                    to: "deployment/composition/DeploymentFeature.ts",
                },
            ],
        },
        {
            name: "composition importing the test kit",
            tree: withFile("composition/X.ts", importsOf("../testing/createTestHost")),
            violations: [{ from: "composition/X.ts", to: "testing/createTestHost.ts" }],
        },
        {
            name: "an import of an entry",
            tree: withFile("testing/X.ts", importsOf("../index")),
            violations: [{ from: "testing/X.ts", to: "index.ts" }],
        },
    ])("flag $name and nothing else", ({ tree, violations }) => {
        expect(Object.values(violationsOf(tree)).flat()).toEqual(violations);
    });

    it("flag a file outside every role folder once, not for each import it makes", () => {
        const violations = violationsOf(
            withFile("deployment/helpers/format.ts", importsOf("../service/DeploymentService")),
        );

        expect(Object.values(violations).flat()).toEqual([
            { from: "deployment/helpers/format.ts", to: "(no role folder)" },
        ]);
    });
});
