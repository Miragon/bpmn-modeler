import {
    buildImportGraph,
    describeDependency,
    exceptionsWithoutIssue,
    findImportCycles,
    instability,
    readSourceTree,
    readWorkspaces,
    requireMatches,
    staleExceptions,
    unexcusedViolations,
    unresolvedRelativeImports,
    unstableDependencies,
    workspaceDependencies,
} from "@miragon/architecture-testing";
import type { KnownException } from "@miragon/architecture-testing";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Rules over every workspace at once: no import cycles inside a workspace or
 * between workspaces, and no workspace depending on a less stable one (Stable
 * Dependencies Principle). Type-only imports count; a cycle of types still
 * ties the files together.
 */
const REPO_ROOT = join(__dirname, "../../..");
const ASSET_EXTENSIONS = [".css", ".json", ".svg"];
// Fixtures stay in: production code imports them (the bpmn-webview dev host).
const SKIP_DIRS = ["node_modules", "dist", "coverage"];

/** Keyed by workspace dir; each names the issue that removes it. */
const STABILITY_EXCEPTIONS: readonly KnownException[] = [];

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
