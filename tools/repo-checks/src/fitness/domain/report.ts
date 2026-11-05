import { type Delta, markDelta, type MarkedFinding } from "./delta";
import type { Finding } from "./finding";
import {
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

export type ReportedFinding = MarkedFinding & { readonly trend?: readonly TrendPoint[] };

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
    readonly base: { readonly source: BaseSource; readonly unmeasurable?: string };
    readonly outcome: FunctionOutcome;
}

export interface FitnessReport {
    readonly head: { readonly commit: string; readonly uncommittedChanges: boolean };
    readonly base: { readonly commit: string; readonly ref: string };
    readonly functions: readonly FunctionReport[];
}

function deltaAgainst(head: readonly Finding[], base: Measurement): Delta {
    // Nothing to compare with, so nothing can be called existing.
    return markDelta(head, isMeasured(base) ? base.findings : []);
}

function withTrends(
    fitnessFunction: FitnessFunction,
    delta: Delta,
    history: TrendHistory | undefined,
): { readonly findings: readonly ReportedFinding[]; readonly resolved: readonly Finding[] } {
    if (history === undefined || !declaresValues(fitnessFunction)) {
        return delta;
    }
    const trends = findingTrends(
        { commit: history.headCommit, findings: delta.findings },
        storedFindingsOf(history.commitsNewestFirst, history.snapshots, fitnessFunction),
    );
    return {
        findings: delta.findings.map((finding) => {
            const trend = trends.get(finding.key);
            return trend === undefined ? finding : { ...finding, trend };
        }),
        resolved: delta.resolved,
    };
}

/** `history` gives a function that declares values the trend of each finding. */
export function functionReport(
    fitnessFunction: FitnessFunction,
    head: Measurement,
    base: { readonly source: BaseSource; readonly measurement: Measurement },
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
        base: isMeasured(base.measurement)
            ? { source: base.source }
            : { source: base.source, unmeasurable: base.measurement.unmeasurable },
        outcome: isMeasured(head)
            ? {
                  kind: "measured",
                  ...withTrends(
                      fitnessFunction,
                      deltaAgainst(head.findings, base.measurement),
                      history,
                  ),
              }
            : { kind: "unmeasurable", reason: head.unmeasurable },
    };
}
