import { EngineSourceStructure } from "../../changeCoupling/adapter/out/engineSourceStructure";
import { createChangeCouplingFitnessFunction } from "../../changeCoupling/service/changeCouplingFitnessFunction";
import { EngineRoleFolderSources } from "../../conventionCoverage/adapter/out/engineRoleFolderSources";
import { createConventionCoverageFitnessFunction } from "../../conventionCoverage/service/conventionCoverageFitnessFunction";
import { GitCommitHistory } from "../../history/adapter/out/gitCommitHistory";
import { createHotspotsFitnessFunction } from "../../hotspots/service/hotspotsFitnessFunction";
import { EngineValueSetSources } from "../../repeatedValueSets/adapter/out/engineValueSetSources";
import { createRepeatedValueSetsFitnessFunction } from "../../repeatedValueSets/service/repeatedValueSetsFitnessFunction";
import { createSizeAndComplexityFitnessFunction } from "../../sizeAndComplexity/service/sizeAndComplexityFitnessFunction";
import { EngineSourceMeasures } from "../../sourceFiles/adapter/out/engineSourceMeasures";
import type { FitnessFunction } from "../domain/fitnessFunction";

const commitHistory = new GitCommitHistory();
const sourceMeasures = new EngineSourceMeasures();

export const FITNESS_FUNCTIONS: readonly FitnessFunction[] = [
    createChangeCouplingFitnessFunction({
        history: commitHistory,
        sources: new EngineSourceStructure(),
    }),
    createConventionCoverageFitnessFunction({ sources: new EngineRoleFolderSources() }),
    createRepeatedValueSetsFitnessFunction({ sources: new EngineValueSetSources() }),
    createSizeAndComplexityFitnessFunction({ sources: sourceMeasures }),
    createHotspotsFitnessFunction({ history: commitHistory, sources: sourceMeasures }),
];
