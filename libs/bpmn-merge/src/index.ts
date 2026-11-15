export { computeMerge } from "./computeMerge";
export type { MergeVersions } from "./computeMerge";
export { MergeDecisions } from "./mergeDecisions";
export type { BlockedPick, OpenConflict, PickOutcome, MergeResolution } from "./mergeDecisions";
export type { Requirement } from "./referenceRules";
export { describeUnmetRequirement } from "./unmetRequirement";
export type { RequirementObstacle, UnmetRequirement } from "./unmetRequirement";
export { isConflictState } from "./mergeResult";
export type {
    ConflictState,
    ElementReference,
    ElementState,
    ElementVersion,
    LayoutState,
    MergeElement,
    MergeResult,
    MergeSide,
    ResolvedState,
    VersionKeys,
} from "./mergeResult";
