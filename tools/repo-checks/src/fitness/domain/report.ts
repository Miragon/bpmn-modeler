import { type Delta, markDelta, type MarkedFinding, type Rename } from "./delta";
import type { Finding } from "./finding";
import {
    type ChangesView,
    declaresValues,
    type Evidence,
    type FindingGroup,
    type FindingValue,
    type FitnessCategories,
    type FitnessFunction,
} from "./fitnessFunction";
import { isMeasured, type Measurement } from "./snapshot";
import { findingTrends, storedFindingsOf, type TrendHistory, type TrendPoint } from "./trend";

export type BaseSource = "snapshot" | "checkout";

type ReportedFinding = MarkedFinding & { readonly trend?: readonly TrendPoint[] };

type FunctionOutcome =
    | {
          readonly kind: "measured";
          readonly findings: readonly ReportedFinding[];
          readonly resolved: readonly Finding[];
      }
    | { readonly kind: "unmeasurable"; readonly reason: string };

export interface FunctionReport {
    readonly id: string;
    readonly version: number;
    readonly categories: FitnessCategories;
    readonly measures: string;
    readonly reliesOn: { readonly skill: string; readonly rule: string };
    readonly misses: readonly string[];
    readonly reportsWrongly: readonly string[];
    readonly evidence: readonly Evidence[];
    readonly groups?: readonly FindingGroup[];
    readonly values?: readonly FindingValue[];
    readonly changesView?: ChangesView;
    readonly base: { readonly source: BaseSource; readonly unmeasurable?: string };
    readonly outcome: FunctionOutcome;
}

export interface FitnessReport {
    readonly head: { readonly commit: string; readonly uncommittedChanges: boolean };
    readonly base: { readonly commit: string; readonly ref: string };
    readonly functions: readonly FunctionReport[];
}

function deltaAgainst(
    head: readonly Finding[],
    base: Measurement,
    renames: readonly Rename[] | undefined,
): Delta {
    // Nothing to compare with, so nothing can be called existing.
    return markDelta(head, isMeasured(base) ? base.findings : [], renames);
}

function withTrends(
    fitnessFunction: FitnessFunction,
    { findings, keysAtBase, resolved }: Delta,
    history: TrendHistory | undefined,
): { readonly findings: readonly ReportedFinding[]; readonly resolved: readonly Finding[] } {
    if (history === undefined || !declaresValues(fitnessFunction)) {
        return { findings, resolved };
    }
    // The stored snapshots go back from the merge base, so a renamed file's series lies under its old key.
    const trends = findingTrends(
        {
            commit: history.headCommit,
            findings: findings.map((finding, index) => ({ ...finding, key: keysAtBase[index] })),
        },
        storedFindingsOf(history.commitsNewestFirst, history.snapshots, fitnessFunction),
    );
    return {
        findings: findings.map((finding, index) => {
            const trend = trends.get(keysAtBase[index]);
            return trend === undefined ? finding : { ...finding, trend };
        }),
        resolved,
    };
}

/**
 * `base.renames` are the files renamed since the merge base, which the delta and the trend follow;
 * `history` gives a function that declares values the trend of each finding.
 */
export function functionReport(
    fitnessFunction: FitnessFunction,
    head: Measurement,
    base: {
        readonly source: BaseSource;
        readonly measurement: Measurement;
        readonly renames?: readonly Rename[];
    },
    history?: TrendHistory,
): FunctionReport {
    return {
        id: fitnessFunction.id,
        version: fitnessFunction.version,
        categories: fitnessFunction.categories,
        measures: fitnessFunction.measures,
        reliesOn: fitnessFunction.reliesOn,
        misses: fitnessFunction.misses,
        reportsWrongly: fitnessFunction.reportsWrongly,
        evidence: fitnessFunction.evidence,
        ...(fitnessFunction.groups === undefined ? {} : { groups: fitnessFunction.groups }),
        ...(fitnessFunction.values === undefined ? {} : { values: fitnessFunction.values }),
        ...(fitnessFunction.changesView === undefined
            ? {}
            : { changesView: fitnessFunction.changesView }),
        base: isMeasured(base.measurement)
            ? { source: base.source }
            : { source: base.source, unmeasurable: base.measurement.unmeasurable },
        outcome: isMeasured(head)
            ? {
                  kind: "measured",
                  ...withTrends(
                      fitnessFunction,
                      deltaAgainst(head.findings, base.measurement, base.renames),
                      history,
                  ),
              }
            : { kind: "unmeasurable", reason: head.unmeasurable },
    };
}
