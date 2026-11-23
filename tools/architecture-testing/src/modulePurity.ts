import { join } from "node:path";

import { compilesWithDom } from "./compilerProgram";
import { isPlatformModule } from "./hostReach";
import { buildImportGraph } from "./importGraph";
import type { ImportEdge, ImportGraph } from "./importGraph";
import { readPathAliases, resolveAliasImport } from "./pathAliases";
import type { PathAlias } from "./pathAliases";
import { roleOf } from "./roleFolders";
import type { Role } from "./roleFolders";
import { pathExists, readSourceTree, readTextFile } from "./sourceTree";
import { readWorkspaces, workspaceOfSpecifier } from "./workspaces";
import type { Workspace } from "./workspaces";

export interface WorkspaceSources extends Workspace {
    /** Its production sources, paths relative to its `src/`. */
    readonly graph: ImportGraph;
}

/** Whether a `domain/` file may import a package specifier. */
export type ModulePurity = (specifier: string) => boolean;

/** Roles that call out, are called from outside, or serve only tests; a domain decides on values alone. */
const IMPURE_ROLES: readonly Role[] = [
    "port",
    "service",
    "adapter/in",
    "adapter/out",
    "composition",
    "testing",
];

interface SourceModule {
    readonly owner: WorkspaceSources;
    /** Relative to the owner's `src/`, where role folders are read. */
    readonly path: string;
    readonly edges: readonly ImportEdge[];
}

/**
 * A module a `domain/` may import: no file it reaches sits in a `port/`, `service/`,
 * `adapter/` or `composition/` folder or imports a platform module, and the compiler
 * program of its workspace loads no DOM lib. A workspace's kind is not read. Imports
 * are followed to the file, through relative imports and the path aliases, into any
 * workspace. The program holds every file the module reaches, so its no-DOM compile
 * answers for the DOM in all of them. `programLoadsDom` is asked last, once per
 * workspace, as it runs the compiler.
 */
export function modulePurity(
    workspaces: readonly WorkspaceSources[],
    aliases: readonly PathAlias[],
    programLoadsDom: (workspace: Workspace) => boolean,
): ModulePurity {
    const moduleByFile = indexModules(workspaces);
    const known = new Set(moduleByFile.keys());
    const domByWorkspace = new Map<string, boolean>();

    const namesWorkspace = (specifier: string): boolean =>
        workspaceOfSpecifier(specifier, workspaces) !== undefined;

    const reachesOnlyPureCode = (start: string): boolean => {
        const pending = [start];
        const seen = new Set(pending);
        const visit = (file: string): void => {
            if (!seen.has(file)) {
                seen.add(file);
                pending.push(file);
            }
        };
        while (pending.length > 0) {
            const { owner, path, edges } = moduleByFile.get(pending.pop()!)!;
            const role = roleOf(path)?.role;
            if (role !== undefined && IMPURE_ROLES.includes(role)) {
                return false;
            }
            for (const { specifier, to } of edges) {
                if (isPlatformModule(specifier)) {
                    return false;
                }
                if (to !== undefined) {
                    visit(repoPathOf(owner, to));
                } else if (namesWorkspace(specifier)) {
                    const target = resolveAliasImport(specifier, aliases, known);
                    if (target === undefined) {
                        return false;
                    }
                    visit(target);
                }
            }
        }
        return true;
    };

    const loadsDom = (workspace: Workspace): boolean => {
        if (!domByWorkspace.has(workspace.name)) {
            domByWorkspace.set(workspace.name, programLoadsDom(workspace));
        }
        return domByWorkspace.get(workspace.name)!;
    };

    return (specifier) => {
        const file = namesWorkspace(specifier)
            ? resolveAliasImport(specifier, aliases, known)
            : undefined;
        return (
            file !== undefined &&
            reachesOnlyPureCode(file) &&
            !loadsDom(moduleByFile.get(file)!.owner)
        );
    };
}

/** Package imports of `domain/` files that name no pure module; a type-only import counts. */
export function impureDomainImports(graph: ImportGraph, isPureModule: ModulePurity): ImportEdge[] {
    return graph.edges.filter(
        ({ from, specifier, to }) =>
            roleOf(from)?.role === "domain" &&
            to === undefined &&
            !specifier.startsWith(".") &&
            !isPureModule(specifier),
    );
}

/** `modulePurity` over the repo: its manifests, each workspace's `src/` and compiler program, and the aliases of `tsconfig.base.json`. */
export function readModulePurity(repoRoot: string): ModulePurity {
    const sources = readWorkspaces(repoRoot).map((workspace): WorkspaceSources => {
        const src = join(repoRoot, workspace.dir, "src");
        return {
            ...workspace,
            graph: buildImportGraph(pathExists(src) ? readSourceTree(src) : []),
        };
    });
    return modulePurity(
        sources,
        readPathAliases(readTextFile(join(repoRoot, "tsconfig.base.json"))),
        ({ dir }) => compilesWithDom(join(repoRoot, dir)),
    );
}

/** Every source file of the workspaces by its repo path. */
function indexModules(workspaces: readonly WorkspaceSources[]): Map<string, SourceModule> {
    const moduleByFile = new Map<string, SourceModule>();
    for (const owner of workspaces) {
        const edgesByPath = new Map<string, ImportEdge[]>();
        for (const edge of owner.graph.edges) {
            edgesByPath.set(edge.from, [...(edgesByPath.get(edge.from) ?? []), edge]);
        }
        for (const path of owner.graph.files) {
            moduleByFile.set(repoPathOf(owner, path), {
                owner,
                path,
                edges: edgesByPath.get(path) ?? [],
            });
        }
    }
    return moduleByFile;
}

function repoPathOf({ dir }: Workspace, path: string): string {
    return `${dir}/src/${path}`;
}
