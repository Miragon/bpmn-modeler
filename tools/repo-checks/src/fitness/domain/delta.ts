import {
    compareText,
    type Finding,
    findingFields,
    keyAroundPaths,
    sameValues,
    sortedValues,
    sortFindings,
} from "./finding";

export type MarkedFinding = Finding & {
    readonly status: "new" | "existing";
    /** On an existing finding, the values of the base finding it matched when they differ. */
    readonly valuesAtBase?: Readonly<Record<string, number>>;
};

/** A value counts as grown when it is higher than at the merge base or the base lacked it. */
export function grewSinceBase({ values = {}, valuesAtBase }: MarkedFinding): boolean {
    if (valuesAtBase === undefined) {
        return false;
    }
    return Object.entries(values).some(
        ([id, value]) => !Object.hasOwn(valuesAtBase, id) || value > valuesAtBase[id],
    );
}

export interface Delta {
    readonly findings: readonly MarkedFinding[];
    /** The key each of `findings` had at the merge base, in their order: where its stored series lies. */
    readonly keysAtBase: readonly string[];
    readonly resolved: readonly Finding[];
}

/** A file git saw renamed between the merge base and the working tree. */
export interface Rename {
    readonly previousPath: string;
    readonly path: string;
}

function groupByKey(findings: readonly Finding[]): Map<string, Finding[]> {
    const byKey = new Map<string, Finding[]>();
    for (const finding of findings) {
        const sameKey = byKey.get(finding.key);
        if (sameKey === undefined) {
            byKey.set(finding.key, [finding]);
        } else {
            sameKey.push(finding);
        }
    }
    return byKey;
}

function changedValuesAtBase(
    { values }: Finding,
    baseFinding: Finding,
): { readonly valuesAtBase?: Readonly<Record<string, number>> } {
    if (values === undefined || baseFinding.values === undefined) {
        return {};
    }
    return sameValues(values, baseFinding.values)
        ? {}
        : { valuesAtBase: sortedValues(baseFinding.values) };
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
    const sortedBase = sortFindings(base);
    const baseByKey = groupByKey(sortedBase);
    const matchedCount = new Map<string, number>();
    const sortedHead = sortFindings(head);
    const keysAtBase = sortedHead.map((finding) => keyAtBase(finding, previousPathOf));
    const findings = sortedHead.map((finding, index): MarkedFinding => {
        const key = keysAtBase[index];
        const matched = matchedCount.get(key) ?? 0;
        const baseFinding = baseByKey.get(key)?.[matched];
        if (baseFinding === undefined) {
            return { ...findingFields(finding), status: "new" };
        }
        matchedCount.set(key, matched + 1);
        return {
            ...findingFields(finding),
            status: "existing",
            ...changedValuesAtBase(finding, baseFinding),
        };
    });

    const resolved = sortedBase
        .filter((finding) => {
            const sameKey = baseByKey.get(finding.key) ?? [];
            return sameKey.indexOf(finding) >= (matchedCount.get(finding.key) ?? 0);
        })
        .map(findingFields);
    return { findings, keysAtBase, resolved };
}
