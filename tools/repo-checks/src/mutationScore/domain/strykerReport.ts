import { compareText } from "../../fitness/domain/finding";
import { isJsonRecord, type MutationRun } from "./mutationRun";
import type { MutationTally } from "./mutationTally";

// Stryker's mutation score: other statuses (Ignored, CompileError, RuntimeError, Pending) do not count.
const DETECTED: ReadonlySet<string> = new Set(["Killed", "Timeout"]);
const UNDETECTED: ReadonlySet<string> = new Set(["Survived", "NoCoverage"]);

const DOMAIN_FILE = /^src\/(.+?)\/domain\//;

export interface ContextTally extends MutationTally {
    /** `path:line mutator` of each undetected mutant. */
    readonly survivors: readonly string[];
}

interface StrykerMutant {
    readonly status: string;
    readonly mutatorName?: string;
    readonly location?: { readonly start?: { readonly line?: number } };
}

interface OpenTally {
    detected: number;
    undetected: number;
    readonly survivors: string[];
}

function strykerMutants(path: string, file: unknown): readonly StrykerMutant[] {
    const mutants = isJsonRecord(file) ? file.mutants : undefined;
    if (!Array.isArray(mutants)) {
        throw new Error(`${path} has no mutants`);
    }
    if (!mutants.every((mutant) => isJsonRecord(mutant) && typeof mutant.status === "string")) {
        throw new Error(`${path} has a mutant without status`);
    }
    return mutants as StrykerMutant[];
}

function count(tally: OpenTally, path: string, mutant: StrykerMutant): void {
    if (DETECTED.has(mutant.status)) {
        tally.detected++;
    } else if (UNDETECTED.has(mutant.status)) {
        tally.undetected++;
        tally.survivors.push(
            `${path}:${mutant.location?.start?.line ?? 0} ${mutant.mutatorName ?? "unknown"}`,
        );
    }
}

/** Per context (`modeler/bpmn` for `src/modeler/bpmn/domain/`), sorted by context. */
export function contextTallies(report: unknown): ReadonlyMap<string, ContextTally> {
    if (!isJsonRecord(report) || !isJsonRecord(report.files)) {
        throw new Error("the Stryker report has no files");
    }
    const tallies = new Map<string, OpenTally>();
    for (const [path, file] of Object.entries(report.files)) {
        const context = DOMAIN_FILE.exec(path)?.[1];
        if (context === undefined) {
            throw new Error(`${path} is not in a src/<context>/domain/ folder`);
        }
        const tally = tallies.get(context) ?? { detected: 0, undetected: 0, survivors: [] };
        for (const mutant of strykerMutants(path, file)) {
            count(tally, path, mutant);
        }
        tallies.set(context, tally);
    }
    return new Map([...tallies].sort(([left], [right]) => compareText(left, right)));
}

export function mutationRunFromStrykerReport(
    report: unknown,
    workspaceDir: string,
    commit: string,
    runId: string,
): MutationRun {
    return {
        schemaVersion: 1,
        runId,
        commit,
        contexts: Object.fromEntries(
            [...contextTallies(report)].map(([context, { detected, undetected }]) => [
                `${workspaceDir}/src/${context}/domain`,
                { detected, undetected },
            ]),
        ),
    };
}
