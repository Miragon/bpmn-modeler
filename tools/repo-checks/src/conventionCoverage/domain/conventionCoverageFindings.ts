import {
    type ArchitectureRule,
    HEXAGONAL_RULES,
    type ImportGraph,
    type Role,
    roleOf,
} from "@miragon/architecture-testing";

import type { Finding } from "../../fitness/domain/finding";
import type { FindingGroup } from "../../fitness/domain/fitnessFunction";
import type { HexagonalWorkspaceSources, PortImplementationCandidate } from "./roleFolderSources";

export const CONVENTION_COVERAGE_GROUPS: readonly [FindingGroup, ...FindingGroup[]] = [
    { id: "unmapped", title: "Outside every role folder" },
    { id: "divergent-import", title: "Imports that contradict the folder" },
    { id: "misplaced-port-implementation", title: "A port implemented outside adapter/out/" },
];

const [PLACEMENT_RULE] = HEXAGONAL_RULES;
const PORT_IMPLEMENTATION_ROLES: readonly Role[] = ["adapter/out", "testing"];

function code(text: string): string {
    return `\`${text}\``;
}

export function conventionCoverageFindings(
    workspaces: readonly HexagonalWorkspaceSources[],
): Finding[] {
    const isPortFile = (path: string): boolean =>
        workspaces.some(({ dir }) => roleInWorkspace(dir, path) === "port");
    return workspaces.flatMap((workspace) => [
        ...HEXAGONAL_RULES.flatMap((rule) => ruleFindings(workspace, rule)),
        ...portImplementationFindings(workspace, isPortFile),
    ]);
}

function roleInWorkspace(dir: string, path: string): Role | undefined {
    const sourceRoot = `${dir}/src/`;
    return path.startsWith(sourceRoot) ? roleOf(path.slice(sourceRoot.length))?.role : undefined;
}

// Unlike the blocking architecture spec, nothing is excused: the excused files are the remaining migration work.
function ruleFindings(
    { dir, graph }: HexagonalWorkspaceSources,
    rule: ArchitectureRule,
): Finding[] {
    const targetsByFile = new Map<string, string[]>();
    for (const { from, to } of rule.violations(graph)) {
        targetsByFile.set(from, [...(targetsByFile.get(from) ?? []), to]);
    }
    return [...targetsByFile].map(([from, targets]) => {
        const path = `${dir}/src/${from}`;
        const key = `${path} — ${rule.rule}`;
        if (rule === PLACEMENT_RULE) {
            return {
                key,
                path,
                line: 1,
                group: "unmapped",
                message: "sits in no role folder and is no entry directly in `src/`",
            };
        }
        const offendingImports = importsOf(graph, from, new Set(targets));
        const importedTargets = [...new Set(offendingImports.map(({ target }) => target))];
        return {
            key,
            path,
            line: offendingImports[0]?.line ?? 1,
            group: "divergent-import",
            message: `breaks “${rule.rule}” by importing ${importedTargets.map(code).join(", ")}`,
        };
    });
}

/** A violation names `to` when the import resolves and its specifier otherwise, as `ArchitectureRule` documents. */
function importsOf(
    graph: ImportGraph,
    from: string,
    targets: ReadonlySet<string>,
): { target: string; line: number }[] {
    return graph.edges
        .filter((edge) => edge.from === from && targets.has(edge.to ?? edge.specifier))
        .map((edge) => ({ target: edge.to ?? edge.specifier, line: edge.line }))
        .sort((left, right) => left.line - right.line);
}

function portImplementationFindings(
    { dir, implementations }: HexagonalWorkspaceSources,
    isPortFile: (path: string) => boolean,
): Finding[] {
    const misplacedByFile = new Map<string, PortImplementationCandidate[]>();
    for (const candidate of implementations) {
        const role = roleInWorkspace(dir, candidate.path);
        const isPlaced = role !== undefined && PORT_IMPLEMENTATION_ROLES.includes(role);
        if (!isPlaced && candidate.interfaceFiles.some(isPortFile)) {
            misplacedByFile.set(candidate.path, [
                ...(misplacedByFile.get(candidate.path) ?? []),
                candidate,
            ]);
        }
    }
    return [...misplacedByFile].map(([path, candidates]) => {
        const byLine = [...candidates].sort((left, right) => left.line - right.line);
        const classes = byLine.map(({ className, interfaceFiles }) => {
            const ports = interfaceFiles.filter(isPortFile);
            const subject = className === undefined ? "an anonymous class" : code(className);
            const noun = ports.length === 1 ? "the port" : "the ports";
            return `${subject} implements ${noun} in ${ports.map(code).join(", ")}`;
        });
        return {
            key: `${path} — implements a port`,
            path,
            line: byLine[0].line,
            group: "misplaced-port-implementation",
            message: `${classes.join("; ")} outside adapter/out/ and testing/`,
        };
    });
}
