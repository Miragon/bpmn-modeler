import type { Workspace } from "./workspaces";
import { workspaceOfSpecifier } from "./workspaces";

export interface WorkspaceDependency {
    readonly from: string;
    readonly to: string;
}

export interface Stability {
    /** Ca: workspaces that depend on this one. */
    readonly afferent: number;
    /** Ce: workspaces this one depends on. */
    readonly efferent: number;
    /** I = Ce / (Ca + Ce); for messages only, comparisons stay on integers. */
    readonly instability: number;
}

/** One entry per ordered pair of workspace dirs; a workspace importing itself is no dependency. */
export function workspaceDependencies(
    specifiersByWorkspace: ReadonlyMap<string, readonly string[]>,
    workspaces: readonly Workspace[],
): WorkspaceDependency[] {
    const pairs = new Set<string>();
    const dependencies: WorkspaceDependency[] = [];
    for (const [from, specifiers] of specifiersByWorkspace) {
        for (const specifier of specifiers) {
            const to = workspaceOfSpecifier(specifier, workspaces)?.dir;
            const pair = `${from}\n${to}`;
            if (to !== undefined && to !== from && !pairs.has(pair)) {
                pairs.add(pair);
                dependencies.push({ from, to });
            }
        }
    }
    return dependencies.sort(
        (left, right) => compare(left.from, right.from) || compare(left.to, right.to),
    );
}

export function instability(dependencies: readonly WorkspaceDependency[]): Map<string, Stability> {
    const counts = new Map<string, { afferent: number; efferent: number }>();
    const countOf = (dir: string) =>
        counts.get(dir) ?? counts.set(dir, { afferent: 0, efferent: 0 }).get(dir)!;
    for (const { from, to } of dependencies) {
        countOf(from).efferent++;
        countOf(to).afferent++;
    }
    return new Map(
        [...counts].map(([dir, { afferent, efferent }]) => [
            dir,
            { afferent, efferent, instability: efferent / (afferent + efferent) },
        ]),
    );
}

/** Stable Dependencies Principle: a workspace depends only on workspaces at least as stable as itself. */
export function unstableDependencies(
    dependencies: readonly WorkspaceDependency[],
): WorkspaceDependency[] {
    const stability = instability(dependencies);
    return dependencies.filter(({ from, to }) => {
        const importer = stability.get(from)!;
        const imported = stability.get(to)!;
        return (
            imported.efferent * (importer.afferent + importer.efferent) >
            importer.efferent * (imported.afferent + imported.efferent)
        );
    });
}

export function describeDependency(
    { from, to }: WorkspaceDependency,
    stability: ReadonlyMap<string, Stability>,
): string {
    const instabilityOf = (dir: string): string =>
        (stability.get(dir)?.instability ?? 0).toFixed(2);
    return `${from} (I=${instabilityOf(from)}) → ${to} (I=${instabilityOf(to)})`;
}

function compare(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
