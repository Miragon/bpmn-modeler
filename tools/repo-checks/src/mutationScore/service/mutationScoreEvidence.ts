import type { EvidenceList } from "../../fitness/domain/fitnessFunction";

export const MUTATION_SCORE_EVIDENCE = [
    {
        kind: "published",
        reference:
            "Stryker, mutant states and metrics (https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/)",
    },
    {
        kind: "published",
        reference:
            "Jia, Harman, An Analysis and Survey of the Development of Mutation Testing, IEEE Transactions on Software Engineering, 2011",
    },
    {
        kind: "trial",
        commit: "89250994",
        outcome:
            "the weekly run of 2026-11-02 (41384596015): 94.3 % over 4,502 mutants (4,247 detected, 255 undetected), template-marketplace lowest at 85.3 %, modeler/dmn without mutants; the summary matches the replaced mutation-summary.mjs in every context",
    },
] as const satisfies EvidenceList;
