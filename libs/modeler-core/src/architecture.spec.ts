import {
    buildImportGraph,
    exceptionsWithoutIssue,
    filesReaching,
    impureDomainImports,
    isHostModule,
    readPureWorkspaces,
    readSourceTree,
    roleOf,
    staleExceptions,
    unexcusedViolations,
} from "@miragon/architecture-testing";
import type {
    ImportEdge,
    ImportGraph,
    KnownException,
    Violation,
    Workspace,
} from "@miragon/architecture-testing";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Architecture gate for `@miragon/bpmn-modeler-core`, on top of the shared
 * role-folder rules the repo-level spec applies to every hexagonal workspace.
 * The engine stays host-agnostic: no file imports `vscode` or reaches a Node
 * host module (`node:*`, `fs`, `http`). Portable Node utilities that exist in
 * any Node host (`path`, `Buffer`) are allowed; they are not host capabilities.
 *
 * `domain/` imports only pure workspaces, decided from their manifests, imports
 * and compiler programs (docs/adr/role-folders.md#domain-imports), and `path`.
 * Contexts meet only in `kernel/` and `editorSession/`, and `kernel/` imports
 * nothing outside itself. A known exception names the issue that removes it,
 * and an exception the code no longer needs fails the gate, so the lists only
 * shrink.
 */
const SRC_ROOT = __dirname;

const PURE_WORKSPACES = readPureWorkspaces(join(SRC_ROOT, "../../.."));
/** `path.posix` is string arithmetic every Node host has; the domain computes workspace paths with it. */
const PORTABLE_NODE_MODULE = "path";
const KERNEL = "kernel";
const SUBSTRATE: readonly string[] = [KERNEL, "editorSession"];

/** The test kit sits in no context; the shared rules keep it apart. */
function contextOf(path: string): string | undefined {
    const location = roleOf(path);
    return location === undefined || location.role === "testing" ? undefined : location.context;
}

function domainPackageViolations(pure: readonly Workspace[]) {
    return (graph: ImportGraph): ImportEdge[] =>
        impureDomainImports(graph, pure).filter(
            ({ specifier }) => specifier !== PORTABLE_NODE_MODULE,
        );
}

function domainImportsOfPath({ edges }: ImportGraph): ImportEdge[] {
    return edges.filter(
        ({ from, specifier }) =>
            roleOf(from)?.role === "domain" && specifier === PORTABLE_NODE_MODULE,
    );
}

function crossContextViolations({ edges }: ImportGraph): ImportEdge[] {
    return edges.filter(({ from, to }) => {
        const fromContext = contextOf(from);
        const toContext = to === undefined ? undefined : contextOf(to);
        return (
            fromContext !== undefined &&
            toContext !== undefined &&
            toContext !== fromContext &&
            !SUBSTRATE.includes(toContext)
        );
    });
}

function kernelImportViolations({ edges }: ImportGraph): ImportEdge[] {
    return edges.filter(
        ({ from, to }) =>
            contextOf(from) === KERNEL && to !== undefined && contextOf(to) !== KERNEL,
    );
}

function asViolation({ from, specifier, to }: ImportEdge): Violation {
    return { from, to: to ?? specifier };
}

function describeViolation({ from, to }: Violation): string {
    return `${from} -> ${to}`;
}

interface ContextRule {
    readonly rule: string;
    readonly violations: (graph: ImportGraph) => ImportEdge[];
    readonly exceptions: readonly KnownException[];
}

function contextRules(pure: readonly Workspace[]): readonly ContextRule[] {
    return [
        {
            rule: "domain imports no package but a pure workspace and path",
            violations: domainPackageViolations(pure),
            exceptions: [
                {
                    from: "*",
                    to: "@miragon/bpmn-modeler-types",
                    until: "#2776: the types library compiles with the DOM for ten canvas and chrome modules",
                },
            ],
        },
        {
            rule: "a context reaches another context only through kernel/ or editorSession/",
            violations: crossContextViolations,
            exceptions: [],
        },
        {
            rule: "kernel/ imports nothing outside kernel/",
            violations: kernelImportViolations,
            exceptions: [],
        },
    ];
}

const CONTEXT_RULES = contextRules(PURE_WORKSPACES);

/** Fixed, so the synthetic cases hold whatever the real tree reads as pure. */
const SYNTHETIC_PURE: readonly Workspace[] = [
    { name: "@miragon/bpmn-modeler-merge", dir: "libs/bpmn-merge", kind: "flat" },
    { name: "@miragon/bpmn-modeler-diff", dir: "libs/bpmn-diff", kind: "flat" },
];

function importsOf(...specifiers: string[]): string {
    return specifiers.map((specifier) => `import "${specifier}";`).join("\n");
}

/** Every import here is allowed by every rule. */
const CONTEXT_TREE = [
    {
        path: "deployment/domain/deploymentTarget.ts",
        text: [
            importsOf("../../kernel/domain/errors", "../../editorSession/domain/session", "path"),
            'import { MERGE_SIDES } from "@miragon/bpmn-modeler-merge";',
            'import type { BpmnDiff } from "@miragon/bpmn-modeler-diff";',
        ].join("\n"),
    },
    {
        path: "deployment/service/DeploymentService.ts",
        text: importsOf("../../kernel/service/ArtifactService", "@miragon/bpmn-modeler-shared"),
    },
    {
        path: "modeler/bpmn/service/BpmnModelerService.ts",
        text: importsOf("../../../editorSession/service/EditorSessionStore", "../domain/model"),
    },
    {
        path: "editorSession/service/EditorSessionStore.ts",
        text: importsOf("../../kernel/domain/errors"),
    },
    {
        path: "testing/createTestHost.ts",
        text: importsOf("../deployment/service/DeploymentService"),
    },
    { path: "index.ts", text: importsOf("./deployment/service/DeploymentService") },
    { path: "modeler/bpmn/domain/model.ts", text: "" },
    { path: "kernel/domain/errors.ts", text: "" },
    { path: "kernel/service/ArtifactService.ts", text: importsOf("../domain/errors") },
    { path: "editorSession/domain/session.ts", text: "" },
];

function violationsWith(path: string, text: string): string[] {
    const graph = buildImportGraph([...CONTEXT_TREE, { path, text }]);
    return contextRules(SYNTHETIC_PURE).flatMap(({ violations }) =>
        violations(graph).map(asViolation).map(describeViolation),
    );
}

describe("context rules on a synthetic graph", () => {
    it("pass a tree whose contexts meet only through kernel/ and editorSession/", () => {
        expect(violationsWith("kernel/domain/x.ts", "")).toEqual([]);
    });

    it.each([
        {
            name: "domain → protocol package, even type-only",
            path: "deployment/domain/x.ts",
            text: 'import type { Query } from "@miragon/bpmn-modeler-shared";',
            violation: "deployment/domain/x.ts -> @miragon/bpmn-modeler-shared",
        },
        {
            name: "domain → a workspace that is not pure, value import",
            path: "deployment/domain/x.ts",
            text: 'import { isEngine } from "@miragon/bpmn-modeler-types";',
            violation: "deployment/domain/x.ts -> @miragon/bpmn-modeler-types",
        },
        {
            name: "domain → a modeler package, which is not flat",
            path: "deployment/domain/x.ts",
            text: importsOf("@miragon/bpmn-modeler"),
            violation: "deployment/domain/x.ts -> @miragon/bpmn-modeler",
        },
        {
            name: "domain → a Node module other than path",
            path: "deployment/domain/x.ts",
            text: importsOf("node:url"),
            violation: "deployment/domain/x.ts -> node:url",
        },
        {
            name: "context → another context",
            path: "template-marketplace/service/X.ts",
            text: importsOf("../../deployment/service/DeploymentService"),
            violation:
                "template-marketplace/service/X.ts -> deployment/service/DeploymentService.ts",
        },
        {
            name: "editorSession → a context",
            path: "editorSession/service/X.ts",
            text: importsOf("../../modeler/bpmn/domain/model"),
            violation: "editorSession/service/X.ts -> modeler/bpmn/domain/model.ts",
        },
        {
            name: "kernel → editorSession",
            path: "kernel/service/X.ts",
            text: importsOf("../../editorSession/domain/session"),
            violation: "kernel/service/X.ts -> editorSession/domain/session.ts",
        },
    ])("flag $name and nothing else", ({ path, text, violation }) => {
        expect(violationsWith(path, text)).toEqual([violation]);
    });
});

describe("modeler-core architecture", () => {
    const graph = buildImportGraph(readSourceTree(SRC_ROOT));

    it("reads the merge and diff libraries as pure workspaces, the protocol library not", () => {
        const pure = PURE_WORKSPACES.map(({ name }) => name);

        expect(pure).toEqual(
            expect.arrayContaining(["@miragon/bpmn-modeler-merge", "@miragon/bpmn-modeler-diff"]),
        );
        expect(pure).not.toContain("@miragon/bpmn-modeler-shared");
    });

    it("still imports path in a domain file, or its allowance goes", () => {
        expect(domainImportsOfPath(graph)).not.toEqual([]);
    });

    it("no engine file imports vscode", () => {
        const offenders = graph.edges
            .filter(({ specifier }) => specifier === "vscode")
            .map(({ from }) => from);
        expect(
            offenders,
            `@miragon/bpmn-modeler-core must be vscode-free; these import it:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it("no engine file transitively reaches a host module", () => {
        const offenders = [...filesReaching(graph, isHostModule)];
        expect(
            offenders,
            `these transitively import a host module (vscode/node:*/fs/http) — ` +
                `the engine must reach the host only through ports:\n${offenders.join("\n")}`,
        ).toEqual([]);
    });

    it.each(CONTEXT_RULES)("$rule", ({ violations, exceptions }) => {
        expect(
            unexcusedViolations(violations(graph).map(asViolation), exceptions).map(
                describeViolation,
            ),
        ).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        const stale = CONTEXT_RULES.flatMap(({ violations, exceptions }) =>
            staleExceptions(violations(graph).map(asViolation), exceptions),
        );
        expect(stale).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        expect(
            exceptionsWithoutIssue(CONTEXT_RULES.flatMap(({ exceptions }) => exceptions)),
        ).toEqual([]);
    });
});
