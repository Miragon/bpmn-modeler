export { computeMerge } from "./classify/service/computeMerge";
export type { MergeVersions } from "./classify/service/computeMerge";
export { MergeDecisions } from "./decide/domain/mergeDecisions";
export { mergeElementNames } from "./project/domain/mergeElementNames";
export { asksToDropHandMerges } from "./decide/domain/pickOutcome";
export type {
    BlockedPick,
    DecisionOrigin,
    HandMergeOptions,
    OpenConflict,
    PickOutcome,
    MergeResolution,
    ScopedDecision,
} from "./decide/domain/mergeDecisions";
export { acceptHandMerge } from "./build/service/acceptHandMerge";
export { describeHandMergeRefusal } from "./decide/domain/handMerge";
export type {
    HandMergedVersion,
    HandMergeOutcome,
    HandMergeRefusal,
    HandMergeScope,
} from "./decide/domain/handMerge";
export { handMergeableSide } from "./decide/domain/handMergeEligibility";
export type { HandMergeTexts } from "./decide/domain/handMergeEligibility";
export type { Requirement } from "./decide/domain/referenceRules";
export { describeUnmetRequirement } from "./decide/domain/unmetRequirement";
export type { RequirementObstacle, UnmetRequirement } from "./decide/domain/unmetRequirement";
export { buildMerged } from "./build/service/buildMerged";
export type { MergedDocument } from "./build/service/buildMerged";
export { prepareMergeSources } from "./sources/service/buildMergedSources";
export type { MergeSources } from "./sources/domain/mergeSources";
export { isConflictState } from "./kernel/domain/mergeResult";
export { mergeRefusalOf } from "./classify/domain/mergeRefusal";
export type { MergeRefusal } from "./classify/domain/mergeRefusal";
export { hasNoShape } from "./kernel/domain/mergeElementShape";
export { mergeNavigationOrder } from "./project/domain/mergeNavigationOrder";
export { mergePaneSteps } from "./project/domain/mergePaneSteps";
export type { MergePaneSteps, MergeStep } from "./project/domain/mergePaneSteps";
export { mergePaneView } from "./project/domain/mergePaneView";
export type {
    ContainerReach,
    ElementPick,
    LackingSide,
    MergePaneView,
    PickableElement,
    PickBadge,
    PickScope,
    ShapelessRow,
} from "./project/domain/mergePaneView";
export type { ValueDifference } from "./project/domain/shapelessValues";
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
} from "./kernel/domain/mergeResult";
