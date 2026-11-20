import {
    defineFitnessFunction,
    type FitnessFunction,
    InsufficientHistory,
} from "../../fitness/domain/fitnessFunction";
import { MUTATED_WORKSPACE_DIR } from "../domain/mutationRun";
import { mutationScoreOnChain } from "../domain/mutationScore";
import type { MutationRuns } from "../port/MutationRuns";
import { MUTATION_SCORE_EVIDENCE } from "./mutationScoreEvidence";

export interface MutationScorePorts {
    readonly runs: MutationRuns;
}

export function createMutationScoreFitnessFunction({ runs }: MutationScorePorts): FitnessFunction {
    return defineFitnessFunction({
        id: "mutation-score",
        version: 1,
        categories: { scope: "atomic", cadence: "triggered", result: "dynamic" },
        measures: `Per domain folder of ${MUTATED_WORKSPACE_DIR} (src/<context>/domain) and in total, the mutation score of each stored Stryker run on the measured commit's first-parent chain: detected (Killed, Timeout) ÷ (detected + undetected (Survived, NoCoverage)) × 100, Stryker's definition; other statuses do not count. The weekly and manual runs of the Mutation workflow on main store their tallies as mutation/<run id>.json on fitness-history; incremental pull-request and merge runs are not stored. Each message gives the latest score with its tallies and the last 8 runs, oldest first; two runs on one commit both count. Nothing is recomputed from git: the series starts at the first stored run.`,
        reliesOn: {
            skill: "tdd",
            rule: "prove the spec bites: kill each surviving mutant with a spec or state why it is equivalent",
        },
        misses: [
            `Everything outside the ${MUTATED_WORKSPACE_DIR} domain folders: services, other workspaces and the rules in libs/modeler-types are not mutated.`,
            "A run that failed or was cancelled stores nothing, so the series skips that week.",
        ],
        reportsWrongly: [
            "At the commit a run measured, the stored snapshot predates the run, so the next report shows that run's score as a change.",
            "Equivalent mutants count as undetected, so a context can stay below 100 % with every rule covered.",
            "A domain folder moved or renamed shows as new and its old folder as resolved once a run measures it: the key names the folder, and the report follows file renames only.",
        ],
        evidence: MUTATION_SCORE_EVIDENCE,
        // Its rows come from a stored run, not from the pull request the next report measures.
        changesView: "full-report-only",
        findFindings: ({ repoRoot, commit }) => {
            const outcome = mutationScoreOnChain(
                runs.firstParentChain(repoRoot, commit),
                runs.storedRuns(repoRoot),
            );
            if (outcome.kind === "noRun") {
                throw new InsufficientHistory(outcome.reason);
            }
            return outcome.findings;
        },
    });
}
