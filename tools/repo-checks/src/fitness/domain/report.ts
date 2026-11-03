import { type Delta, markDelta, type MarkedFinding } from "./delta";
import type { Finding } from "./finding";
import type { Evidence, FindingGroup, FitnessCategories, FitnessFunction } from "./fitnessFunction";
import { isMeasured, type Measurement } from "./snapshot";

export type BaseSource = "snapshot" | "checkout";

type FunctionOutcome =
    | {
          readonly kind: "measured";
          readonly findings: readonly MarkedFinding[];
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

export function functionReport(
    fitnessFunction: FitnessFunction,
    head: Measurement,
    base: { readonly source: BaseSource; readonly measurement: Measurement },
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
        base: isMeasured(base.measurement)
            ? { source: base.source }
            : { source: base.source, unmeasurable: base.measurement.unmeasurable },
        outcome: isMeasured(head)
            ? { kind: "measured", ...deltaAgainst(head.findings, base.measurement) }
            : { kind: "unmeasurable", reason: head.unmeasurable },
    };
}
