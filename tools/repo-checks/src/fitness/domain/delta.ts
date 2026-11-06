import { compareText, type Finding, findingFields, keyAroundPaths, sortFindings } from "./finding";

export type MarkedFinding = Finding & { readonly status: "new" | "existing" };

export interface Delta {
    readonly findings: readonly MarkedFinding[];
    readonly resolved: readonly Finding[];
}

/** A file git saw renamed between the merge base and the working tree. */
export interface Rename {
    readonly previousPath: string;
    readonly path: string;
}

function countByKey(findings: readonly Finding[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { key } of findings) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

/** The key a head finding had at the merge base, before the files it names were renamed. */
function keyAtBase(
    { key, paths, pathOrder }: Finding,
    previousPathOf: ReadonlyMap<string, string>,
): string {
    if (paths === undefined || !paths.some((path) => previousPathOf.has(path))) {
        return key;
    }
    const around = keyAroundPaths(key, paths);
    if (around === undefined) {
        return key;
    }
    const previousPaths = paths.map((path) => previousPathOf.get(path) ?? path);
    if (pathOrder === "code-unit") {
        previousPaths.sort(compareText);
    }
    return previousPaths.reduce((text, path, index) => text + path + around[index + 1], around[0]);
}

/** Matches each head finding by the key it had at the merge base, its `paths` under their names there. */
export function markDelta(
    head: readonly Finding[],
    base: readonly Finding[],
    renames: readonly Rename[] = [],
): Delta {
    const previousPathOf = new Map(renames.map(({ previousPath, path }) => [path, previousPath]));
    const unmatchedBase = countByKey(base);
    const findings = sortFindings(head).map((finding): MarkedFinding => {
        const key = keyAtBase(finding, previousPathOf);
        const unmatched = unmatchedBase.get(key) ?? 0;
        if (unmatched === 0) {
            return { ...findingFields(finding), status: "new" };
        }
        unmatchedBase.set(key, unmatched - 1);
        return { ...findingFields(finding), status: "existing" };
    });

    const resolvedCount = new Map(unmatchedBase);
    const resolved = sortFindings(base)
        .reverse()
        .filter(({ key }) => {
            const remaining = resolvedCount.get(key) ?? 0;
            resolvedCount.set(key, remaining - 1);
            return remaining > 0;
        })
        .reverse()
        .map(findingFields);
    return { findings, resolved };
}
