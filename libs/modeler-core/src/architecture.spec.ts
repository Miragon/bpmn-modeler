import {
    buildImportGraph,
    exceptionsWithoutIssue,
    filesReaching,
    isHostModule,
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
} from "@miragon/architecture-testing";
import { describe, expect, it } from "vitest";

/**
 * Architecture gate for `@miragon/bpmn-modeler-core`, on top of the shared
 * role-folder rules the repo-level spec applies to every hexagonal workspace.
 * The engine stays host-agnostic: no file imports `vscode` or reaches a Node
 * host module (`node:*`, `fs`, `http`). Pure Node utilities that exist in any
 * Node host (`path`, `Buffer`) are allowed; they are not host capabilities.
 *
 * Contexts meet only in `kernel/` and `editorSession/`, and `kernel/` imports
 * nothing outside itself. A known exception names the issue that removes it,
 * and an exception the code no longer needs fails the gate, so the lists only
 * shrink.
 */
const SRC_ROOT = __dirname;

const DOMAIN_PACKAGES: readonly string[] = ["@miragon/bpmn-modeler-types", "path"];
const KERNEL = "kernel";
const SUBSTRATE: readonly string[] = [KERNEL, "editorSession"];

/** The test kit sits in no context; the shared rules keep it apart. */
function contextOf(path: string): string | undefined {
    const location = roleOf(path);
    return location === undefined || location.role === "testing" ? undefined : location.context;
}

function domainPackageViolations({ edges }: ImportGraph): ImportEdge[] {
    return edges.filter(
        ({ from, specifier, to }) =>
            roleOf(from)?.role === "domain" &&
            to === undefined &&
            !specifier.startsWith(".") &&
            !DOMAIN_PACKAGES.includes(specifier),
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

const CONTEXT_RULES: readonly ContextRule[] = [
    {
        rule: "domain imports no package but @miragon/bpmn-modeler-types and path",
        violations: domainPackageViolations,
        exceptions: [],
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

function importsOf(...specifiers: string[]): string {
    return specifiers.map((specifier) => `import "${specifier}";`).join("\n");
}

/** Every import here is allowed by every rule. */
const CONTEXT_TREE = [
    {
        path: "deployment/domain/deploymentTarget.ts",
        text: importsOf(
            "../../kernel/domain/errors",
            "../../editorSession/domain/session",
            "@miragon/bpmn-modeler-types",
            "path",
        ),
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
    return CONTEXT_RULES.flatMap(({ violations }) =>
        violations(graph).map(asViolation).map(describeViolation),
    );
}

describe("context rules on a synthetic graph", () => {
    it("pass a tree whose contexts meet only through kernel/ and editorSession/", () => {
        expect(violationsWith("kernel/domain/x.ts", "")).toEqual([]);
    });

    it.each([
        {
            name: "domain → protocol package",
            path: "deployment/domain/x.ts",
            text: importsOf("@miragon/bpmn-modeler-shared"),
            violation: "deployment/domain/x.ts -> @miragon/bpmn-modeler-shared",
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
