import { isBuiltin } from "node:module";
import { join } from "node:path";

import { compilesWithDom } from "./compilerProgram";
import { isHostModule } from "./hostReach";
import { buildImportGraph } from "./importGraph";
import type { ImportEdge, ImportGraph } from "./importGraph";
import { readPathAliases, resolveAliasImport } from "./pathAliases";
import type { PathAlias } from "./pathAliases";
import { roleOf } from "./roleFolders";
import { pathExists, readSourceTree, readTextFile } from "./sourceTree";
import { readWorkspaces, workspaceOfSpecifier } from "./workspaces";
import type { Workspace } from "./workspaces";

export interface WorkspaceSources extends Workspace {
    /** Its production sources, paths relative to its `src/`. */
    readonly graph: ImportGraph;
}

const FLAT = "flat";
const ELECTRON = /^electron(\/|$)/;

/**
 * The workspaces a `domain/` may import: `flat`, no file they reach imports a
 * platform module, and their compiler program loads no DOM lib. Imports are followed
 * to the file, through relative imports and the path aliases, and only into flat
 * workspaces. The program holds every file the workspace reaches, so its no-DOM
 * compile answers for the DOM in all of them. `programLoadsDom` is asked last, and
 * only about a workspace that passes the rest, as it runs the compiler.
 */
export function pureWorkspaces(
    workspaces: readonly WorkspaceSources[],
    aliases: readonly PathAlias[],
    programLoadsDom: (workspace: Workspace) => boolean,
): Workspace[] {
    const ownerByFile = new Map<string, WorkspaceSources>();
    const edgesByFile = new Map<string, ImportEdge[]>();
    for (const workspace of workspaces) {
        for (const path of workspace.graph.files) {
            ownerByFile.set(repoPathOf(workspace, path), workspace);
        }
        for (const edge of workspace.graph.edges) {
            const from = repoPathOf(workspace, edge.from);
            edgesByFile.set(from, [...(edgesByFile.get(from) ?? []), edge]);
        }
    }
    const known = new Set(ownerByFile.keys());

    const reachesOnlyPureCode = (start: WorkspaceSources): boolean => {
        const pending = start.graph.files.map((path) => repoPathOf(start, path));
        const seen = new Set(pending);
        const visit = (file: string): void => {
            if (!seen.has(file)) {
                seen.add(file);
                pending.push(file);
            }
        };
        while (pending.length > 0) {
            const file = pending.pop()!;
            const owner = ownerByFile.get(file)!;
            if (owner.kind !== FLAT) {
                return false;
            }
            for (const { specifier, to } of edgesByFile.get(file) ?? []) {
                if (isPlatformModule(specifier)) {
                    return false;
                }
                if (to !== undefined) {
                    visit(repoPathOf(owner, to));
                } else if (workspaceOfSpecifier(specifier, workspaces) !== undefined) {
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

    return workspaces.filter(
        (workspace) =>
            workspace.kind === FLAT &&
            reachesOnlyPureCode(workspace) &&
            !programLoadsDom(workspace),
    );
}

/** Package imports of `domain/` files that name no pure workspace; a type-only import counts. */
export function impureDomainImports(graph: ImportGraph, pure: readonly Workspace[]): ImportEdge[] {
    return graph.edges.filter(
        ({ from, specifier, to }) =>
            roleOf(from)?.role === "domain" &&
            to === undefined &&
            !specifier.startsWith(".") &&
            workspaceOfSpecifier(specifier, pure) === undefined,
    );
}

/** `pureWorkspaces` over the repo: its manifests, each workspace's `src/` and compiler program, and the aliases of `tsconfig.base.json`. */
export function readPureWorkspaces(repoRoot: string): Workspace[] {
    const sources = readWorkspaces(repoRoot).map((workspace): WorkspaceSources => {
        const src = join(repoRoot, workspace.dir, "src");
        return {
            ...workspace,
            graph: buildImportGraph(pathExists(src) ? readSourceTree(src) : []),
        };
    });
    return pureWorkspaces(
        sources,
        readPathAliases(readTextFile(join(repoRoot, "tsconfig.base.json"))),
        ({ dir }) => compilesWithDom(join(repoRoot, dir)),
    );
}

function repoPathOf({ dir }: Workspace, path: string): string {
    return `${dir}/src/${path}`;
}

/** A module only a host provides: a Node built-in (`path` included), `vscode` or `electron`. */
function isPlatformModule(specifier: string): boolean {
    return isBuiltin(specifier) || isHostModule(specifier) || ELECTRON.test(specifier);
}
