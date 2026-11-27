import {
    buildImportGraph,
    describeDependency,
    exceptionsWithoutIssue,
    findImportCycles,
    instability,
    isWorkspaceKind,
    readAsyncSyntax,
    readRuntimeDeclarations,
    readSourceTree,
    readWorkspaces,
    requireMatches,
    roleOf,
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
    SourceFile,
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
 * declared kind, with the syntax of its port/ and domain/ files. Type-only
 * imports count; a cycle of types still ties the files together.
 */
const REPO_ROOT = join(__dirname, "../../..");
const ASSET_EXTENSIONS = [".css", ".json", ".svg"];
// Fixtures stay in: production code imports them (the bpmn-webview dev host).
const SKIP_DIRS = ["node_modules", "dist", "coverage"];

/** Keyed by workspace dir; each names the issue that removes it. */
const STABILITY_EXCEPTIONS: readonly KnownException[] = [];

const BPMN_MODELER = "packages/bpmn-modeler/src";
const CONSTRUCTION_OUT_OF_THE_FACADES = "#2249 step 2: construction out of the facades";

function bpmnModelerException(from: string, to: string, until: string): KnownException {
    return { from: `${BPMN_MODELER}/${from}`, to: `${BPMN_MODELER}/${to}`, until };
}

/**
 * One blanket entry per workspace not yet moved into role folders, naming the issue that moves
 * it; pairs of files for one that moved without splitting a file, each naming the issue or the
 * step of it that removes it.
 */
const ROLE_EXCEPTIONS: readonly KnownException[] = [
    ...[
        "composition/lintModules.ts",
        "popupMenuAnnotations/adapter/in/popupMenuAnnotationsModule.ts",
        "tokenSimulation/adapter/in/tokenSimulationBehaviorNamesModule.ts",
    ].map((to) =>
        bpmnModelerException("design/service/designer.ts", to, CONSTRUCTION_OUT_OF_THE_FACADES),
    ),
    bpmnModelerException(
        "modeler/port/publicApi.ts",
        "bpmnlint/service/LintConfigService.ts",
        "#2249 step 2: LintCallbacks split from LintConfigService into the LintModule port",
    ),
    bpmnModelerException(
        "bpmnlint/service/LintConfigService.ts",
        "bpmnlint/adapter/out/browserLinter.ts",
        "#2249 step 2: the linter injected into LintConfigService",
    ),
    bpmnModelerException(
        "templatePreview/service/createTemplatePreview.ts",
        "composition/createModeler.ts",
        "#2249 step 2: the template preview a preset of its own in composition/",
    ),
];

/** Keyed by file and `<form> <name>`, such as `const OPEN`; each names the issue that removes it. */
const PORT_VALUE_EXCEPTIONS: readonly KnownException[] = [];

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

    // Test folders stay out: they hold tests and their inputs, not code with a role.
    const workspacesWithRoles = workspacesWithSources.flatMap(({ dir, kind }) => {
        if (!isWorkspaceKind(kind)) {
            return [];
        }
        const tree = readSourceTree(join(REPO_ROOT, dir, "src"));
        return [{ dir, kind, tree, graph: buildImportGraph(tree) }];
    });
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

    // No import rule sees a value declared in place, so the port's declarations are read.
    describe("hexagonal port/ files", () => {
        const portFiles = requireMatches(
            "port/ files of hexagonal workspaces",
            workspacesWithRoles
                .filter(({ kind }) => kind === "hexagonal")
                .flatMap(({ dir, tree }) => tree.filter(isPortFile).map((file) => ({ dir, file }))),
        );
        const portValues = portFiles.flatMap(({ dir, file }) => runtimeValuesIn(dir, file));

        it("a port/ file declares only types", () => {
            expect(
                unexcusedViolations(portValues, PORT_VALUE_EXCEPTIONS).map(
                    ({ from, to, line }) =>
                        `${from}:${line} declares ${to}; a port/ file holds only interfaces, type aliases and type-only exports`,
                ),
            ).toEqual([]);
        });

        it("lists no exception the code no longer needs", () => {
            expect(staleExceptions(portValues, PORT_VALUE_EXCEPTIONS)).toEqual([]);
        });

        it("names the issue that removes each exception", () => {
            expect(exceptionsWithoutIssue(PORT_VALUE_EXCEPTIONS)).toEqual([]);
        });
    });

    // A domain that awaits waits on something outside it; that call belongs to a service.
    describe("hexagonal domain/ files", () => {
        const domainFiles = requireMatches(
            "domain/ files of hexagonal workspaces",
            workspacesWithRoles
                .filter(({ kind }) => kind === "hexagonal")
                .flatMap(({ dir, tree }) =>
                    tree.filter(isDomainFile).map((file) => ({ dir, file })),
                ),
        );

        it("a domain/ file declares no async function and awaits nothing", () => {
            expect(
                domainFiles.flatMap(({ dir, file: { path, text } }) =>
                    readAsyncSyntax(path, text).map(
                        ({ form, line }) =>
                            `${dir}/src/${path}:${line} uses ${form}; a domain/ file decides on values it is handed, a service awaits`,
                    ),
                ),
            ).toEqual([]);
        });
    });
});

function isPortFile({ path }: SourceFile): boolean {
    return roleOf(path)?.role === "port";
}

function isDomainFile({ path }: SourceFile): boolean {
    return roleOf(path)?.role === "domain";
}

function runtimeValuesIn(
    dir: string,
    { path, text }: SourceFile,
): (Violation & { readonly line: number })[] {
    return readRuntimeDeclarations(path, text).map(({ form, name, line }) => ({
        from: `${dir}/src/${path}`,
        to: `${form} ${name}`,
        line,
    }));
}

function inWorkspace(dir: string, graph: ImportGraph): (violation: Violation) => Violation {
    const files = new Set(graph.files);
    const rooted = (path: string): string => (files.has(path) ? `${dir}/src/${path}` : path);
    return ({ from, to }) => ({ from: rooted(from), to: rooted(to) });
}
