import { type Finding, sortFindings } from "./finding";

export type MarkedFinding = Finding & { readonly status: "new" | "existing" };

export interface Delta {
    readonly findings: readonly MarkedFinding[];
    readonly resolved: readonly Finding[];
}

function countByKey(findings: readonly Finding[]): Map<string, number> {
    const counts = new Map<string, number>();
    for (const { key } of findings) {
        counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
}

export function markDelta(head: readonly Finding[], base: readonly Finding[]): Delta {
    const unmatchedBase = countByKey(base);
    const findings = sortFindings(head).map((finding): MarkedFinding => {
        const unmatched = unmatchedBase.get(finding.key) ?? 0;
        if (unmatched === 0) {
            return { ...finding, status: "new" };
        }
        unmatchedBase.set(finding.key, unmatched - 1);
        return { ...finding, status: "existing" };
    });

    const resolvedCount = new Map(unmatchedBase);
    const resolved = sortFindings(base)
        .reverse()
        .filter(({ key }) => {
            const remaining = resolvedCount.get(key) ?? 0;
            resolvedCount.set(key, remaining - 1);
            return remaining > 0;
        })
        .reverse();
    return { findings, resolved };
}
