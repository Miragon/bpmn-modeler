import type { Finding } from "./finding";
import { isMeasured, type Snapshot, usableEntry, type VersionedFunction } from "./snapshot";

const TREND_MAX_CHANGES = 5;

export interface TrendPoint {
    /** The oldest commit holding these values: the one that changed them. */
    readonly commit: string;
    readonly values: Readonly<Record<string, number>>;
}

/** `findings` is unset where the function has no usable entry: no snapshot, another version, unmeasurable. */
export interface StoredFindings {
    readonly commit: string;
    readonly findings?: readonly Finding[];
}

export interface TrendHistory {
    readonly headCommit: string;
    readonly commitsNewestFirst: readonly string[];
    readonly snapshots: ReadonlyMap<string, Snapshot>;
}

export function storedFindingsOf(
    commitsNewestFirst: readonly string[],
    snapshots: ReadonlyMap<string, Snapshot>,
    fitnessFunction: VersionedFunction,
): StoredFindings[] {
    return commitsNewestFirst.map((commit) => {
        const entry = usableEntry(snapshots.get(commit), fitnessFunction);
        return entry !== undefined && isMeasured(entry)
            ? { commit, findings: entry.findings }
            : { commit };
    });
}

interface IndexedFindings {
    readonly commit: string;
    readonly byKey: ReadonlyMap<string, Finding>;
    readonly repeatedKeys: ReadonlySet<string>;
}

function indexByKey(commit: string, findings: readonly Finding[]): IndexedFindings {
    const byKey = new Map<string, Finding>();
    const repeatedKeys = new Set<string>();
    for (const finding of findings) {
        if (byKey.has(finding.key)) {
            repeatedKeys.add(finding.key);
        }
        byKey.set(finding.key, finding);
    }
    return { commit, byKey, repeatedKeys };
}

function sameValues(
    left: Readonly<Record<string, number>>,
    right: Readonly<Record<string, number>>,
): boolean {
    const leftIds = Object.keys(left);
    return (
        leftIds.length === Object.keys(right).length &&
        leftIds.every((id) => Object.hasOwn(right, id) && left[id] === right[id])
    );
}

function trendOf(
    key: string,
    head: TrendPoint,
    stored: readonly IndexedFindings[],
    maxChanges: number,
): TrendPoint[] {
    const newestFirst = [head];
    for (const { commit, byKey, repeatedKeys } of stored) {
        const finding = byKey.get(key);
        if (finding === undefined || repeatedKeys.has(key)) {
            break;
        }
        const values = finding.values ?? {};
        const oldest = newestFirst[newestFirst.length - 1];
        if (sameValues(oldest.values, values)) {
            newestFirst[newestFirst.length - 1] = { commit, values: oldest.values };
        } else if (newestFirst.length > maxChanges) {
            break;
        } else {
            newestFirst.push({ commit, values });
        }
    }
    return newestFirst.reverse();
}

/**
 * Per key that occurs once at HEAD, its values over the stored findings, oldest first and HEAD's
 * last. A commit without findings is a gap and skipped; a commit that lacks the key, or holds it
 * twice, ends its series.
 */
export function findingTrends(
    head: { readonly commit: string; readonly findings: readonly Finding[] },
    storedNewestFirst: readonly StoredFindings[],
    maxChanges = TREND_MAX_CHANGES,
): ReadonlyMap<string, readonly TrendPoint[]> {
    const stored = storedNewestFirst.flatMap(({ commit, findings }) =>
        findings === undefined ? [] : [indexByKey(commit, findings)],
    );
    const atHead = indexByKey(head.commit, head.findings);
    const trends = new Map<string, readonly TrendPoint[]>();
    for (const [key, finding] of atHead.byKey) {
        if (!atHead.repeatedKeys.has(key)) {
            const headPoint = { commit: head.commit, values: finding.values ?? {} };
            trends.set(key, trendOf(key, headPoint, stored, maxChanges));
        }
    }
    return trends;
}
