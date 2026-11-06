import { EngineSourceStructure } from "../../changeCoupling/adapter/out/engineSourceStructure";
import { createChangeCouplingFitnessFunction } from "../../changeCoupling/service/changeCouplingFitnessFunction";
import { createMissedPartnerFitnessFunction } from "../../changeCoupling/service/missedPartnerFitnessFunction";
import { GitMutationRuns } from "../../mutationScore/adapter/out/gitMutationRuns";
import { createMutationScoreFitnessFunction } from "../../mutationScore/service/mutationScoreFitnessFunction";
import { EngineRoleFolderSources } from "../../conventionCoverage/adapter/out/engineRoleFolderSources";
import { createConventionCoverageFitnessFunction } from "../../conventionCoverage/service/conventionCoverageFitnessFunction";
import { GitCommitHistory } from "../../history/adapter/out/gitCommitHistory";
import { createHotspotsFitnessFunction } from "../../hotspots/service/hotspotsFitnessFunction";
import { EngineHostTextSources } from "../../hostText/adapter/out/engineHostTextSources";
import { createHostTextFitnessFunction } from "../../hostText/service/hostTextFitnessFunction";
import { EngineValueSetSources } from "../../repeatedValueSets/adapter/out/engineValueSetSources";
import { createRepeatedValueSetsFitnessFunction } from "../../repeatedValueSets/service/repeatedValueSetsFitnessFunction";
import { createSizeAndComplexityFitnessFunction } from "../../sizeAndComplexity/service/sizeAndComplexityFitnessFunction";
import { EngineSourceMeasures } from "../../sourceFiles/adapter/out/engineSourceMeasures";
import type { FitnessFunction } from "../domain/fitnessFunction";

const commitHistory = new GitCommitHistory();
const sourceMeasures = new EngineSourceMeasures();
const sourceStructure = new EngineSourceStructure();

export const FITNESS_FUNCTIONS: readonly FitnessFunction[] = [
    createChangeCouplingFitnessFunction({ history: commitHistory, sources: sourceStructure }),
    createMissedPartnerFitnessFunction({ history: commitHistory, sources: sourceStructure }),
    createConventionCoverageFitnessFunction({ sources: new EngineRoleFolderSources() }),
    createRepeatedValueSetsFitnessFunction({ sources: new EngineValueSetSources() }),
    createHostTextFitnessFunction({ sources: new EngineHostTextSources() }),
    createSizeAndComplexityFitnessFunction({ sources: sourceMeasures }),
    createHotspotsFitnessFunction({ history: commitHistory, sources: sourceMeasures }),
    createMutationScoreFitnessFunction({ runs: new GitMutationRuns() }),
];
