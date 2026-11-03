import { EngineSourceStructure } from "../../changeCoupling/adapter/out/engineSourceStructure";
import { createChangeCouplingFitnessFunction } from "../../changeCoupling/service/changeCouplingFitnessFunction";
import { EngineRoleFolderSources } from "../../conventionCoverage/adapter/out/engineRoleFolderSources";
import { createConventionCoverageFitnessFunction } from "../../conventionCoverage/service/conventionCoverageFitnessFunction";
import { GitCommitHistory } from "../../history/adapter/out/gitCommitHistory";
import type { FitnessFunction } from "../domain/fitnessFunction";

export const FITNESS_FUNCTIONS: readonly FitnessFunction[] = [
    createChangeCouplingFitnessFunction({
        history: new GitCommitHistory(),
        sources: new EngineSourceStructure(),
    }),
    createConventionCoverageFitnessFunction({ sources: new EngineRoleFolderSources() }),
];
