import {
    buildImportGraph,
    describeDependency,
    exceptionsWithoutIssue,
    findImportCycles,
    instability,
    isWorkspaceKind,
    readSourceTree,
    readWorkspaces,
    requireMatches,
    RULES_BY_KIND,
    staleExceptions,
    unexcusedViolations,
    unresolvedRelativeImports,
    unstableDependencies,
    workspaceDependencies,
} from "@miragon/architecture-testing";
import type {
    ImportGraph,
    KnownException,
    Violation,
    WorkspaceKind,
} from "@miragon/architecture-testing";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rules over every workspace at once: no import cycles inside a workspace or
 * between workspaces, no workspace depending on a less stable one (Stable
 * Dependencies Principle), and the role-folder rules of each workspace's
 * declared kind. Type-only imports count; a cycle of types still ties the
 * files together.
 */
const REPO_ROOT = join(__dirname, "../../..");
const ASSET_EXTENSIONS = [".css", ".json", ".svg"];
// Fixtures stay in: production code imports them (the bpmn-webview dev host).
const SKIP_DIRS = ["node_modules", "dist", "coverage"];

/** Keyed by workspace dir; each names the issue that removes it. */
const STABILITY_EXCEPTIONS: readonly KnownException[] = [];

/** One per workspace not yet moved into role folders, naming the issue that moves it. */
const ROLE_EXCEPTIONS: readonly KnownException[] = [
    { from: "apps/modeler-bridge", to: "*", until: "#2126" },
    { from: "apps/bpmn-webview", to: "*", until: "#2129" },
    { from: "apps/dmn-webview", to: "*", until: "#2129" },
    { from: "apps/form-webview", to: "*", until: "#2129" },
    { from: "apps/deployment-webview", to: "*", until: "#2129" },
    { from: "libs/element-template-builder", to: "*", until: "#2130" },
];

const workspaces = readWorkspaces(REPO_ROOT);
const workspacesWithSources = requireMatches(
    "workspaces with sources",
    workspaces.filter(({ dir }) => existsSync(join(REPO_ROOT, dir, "src"))),
).map((workspace) => ({
    ...workspace,
    graph: buildImportGraph(
        readSourceTree(join(REPO_ROOT, workspace.dir, "src"), { skipDirs: SKIP_DIRS }),
    ),
}));

describe("every workspace", () => {
    it.each(workspacesWithSources)("$name has no import cycles", ({ graph }) => {
        expect(findImportCycles(graph.edges).map((cycle) => cycle.join(", "))).toEqual([]);
    });

    // An unresolved import is a missing edge, so the cycle rule would not see it.
    it.each(workspacesWithSources)("$name resolves every relative import", ({ graph }) => {
        expect(
            unresolvedRelativeImports(graph, ASSET_EXTENSIONS).map(
                ({ from, specifier }) => `${from} → ${specifier}`,
            ),
        ).toEqual([]);
    });
});

describe("workspace dependencies", () => {
    const dependencies = workspaceDependencies(
        new Map(
            workspacesWithSources.map(({ dir, graph }) => [
                dir,
                graph.edges.map(({ specifier }) => specifier),
            ]),
        ),
        workspaces,
    );
    const unstable = unstableDependencies(dependencies);

    // The stability rule passes a cycle between workspaces of equal instability.
    it("no two workspaces import each other in a cycle", () => {
        expect(findImportCycles(dependencies).map((cycle) => cycle.join(", "))).toEqual([]);
    });

    it("no workspace imports a less stable workspace", () => {
        const stability = instability(dependencies);
        expect(
            unexcusedViolations(unstable, STABILITY_EXCEPTIONS).map((dependency) =>
                describeDependency(dependency, stability),
            ),
        ).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        expect(staleExceptions(unstable, STABILITY_EXCEPTIONS)).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        expect(exceptionsWithoutIssue(STABILITY_EXCEPTIONS)).toEqual([]);
    });
});

describe("role folders", () => {
    it("every workspace declares a known architecture kind", () => {
        expect(
            workspaces
                .filter(({ kind }) => !isWorkspaceKind(kind))
                .map(({ dir, kind }) => `${dir}: ${kind ?? "(none)"}`),
        ).toEqual([]);
    });

    // Test fixtures stay out: they are inputs, not code with a role.
    const workspacesWithRoles = workspacesWithSources.flatMap(({ dir, kind }) =>
        isWorkspaceKind(kind)
            ? [{ dir, kind, graph: buildImportGraph(readSourceTree(join(REPO_ROOT, dir, "src"))) }]
            : [],
    );
    const kindRules = (Object.keys(RULES_BY_KIND) as WorkspaceKind[]).flatMap((kind) =>
        RULES_BY_KIND[kind].map(({ rule, violations }) => ({ kind, rule, violations })),
    );
    const violationsOf = ({ kind, violations }: (typeof kindRules)[number]): Violation[] =>
        workspacesWithRoles
            .filter((workspace) => workspace.kind === kind)
            .flatMap(({ dir, graph }) => violations(graph).map(inWorkspace(dir, graph)));

    it.each(kindRules)("$kind: $rule", (kindRule) => {
        expect(
            unexcusedViolations(violationsOf(kindRule), ROLE_EXCEPTIONS).map(
                ({ from, to }) => `${from} → ${to}`,
            ),
        ).toEqual([]);
    });

    it("lists no exception the code no longer needs", () => {
        expect(staleExceptions(kindRules.flatMap(violationsOf), ROLE_EXCEPTIONS)).toEqual([]);
    });

    it("names the issue that removes each exception", () => {
        expect(exceptionsWithoutIssue(ROLE_EXCEPTIONS)).toEqual([]);
    });
});

function inWorkspace(dir: string, graph: ImportGraph): (violation: Violation) => Violation {
    const files = new Set(graph.files);
    const rooted = (path: string): string => (files.has(path) ? `${dir}/src/${path}` : path);
    return ({ from, to }) => ({ from: rooted(from), to: rooted(to) });
}
