import type { ElementSnapshot, ExecutionPackage, PrefixedModdle } from "@miragon/bpmn-modeler-diff";

import type { MergeVersions } from "../../classify/domain/versionNames";
import type { HandMergeTexts } from "../../decide/domain/handMergeEligibility";
import type { MergeSide, VersionKeys } from "../../kernel/domain/mergeResult";

export interface MergeModdle extends PrefixedModdle {
    /** Current first, so current keeps its prefixes and the others get a fresh one on a clash. */
    readonly prefixSources: readonly string[];
    readonly engine?: ExecutionPackage;
}

/** What a file holds outside its elements: the definitions' attributes, extension elements and imports. */
export interface DocumentFrame {
    /** By name, namespace declarations left out: the build declares every namespace in use. */
    readonly attributes: Readonly<Record<string, string>>;
    readonly extensionElements: string;
    readonly imports: string;
}

/**
 * What every build of one merge shares, parsed once: the caller keeps it for
 * the merge's lifetime and passes it to each build. Nothing in it is changed
 * by a build.
 */
export interface MergeSources {
    readonly versions: MergeVersions;
    readonly versionKeys: VersionKeys;
    readonly mergeModdle: MergeModdle;
    readonly snapshots: Readonly<Record<MergeSide, ReadonlyMap<string, ElementSnapshot>>>;
    readonly frames: {
        readonly base?: DocumentFrame;
        readonly current: DocumentFrame;
        readonly incoming: DocumentFrame;
    };
    /** Each side's flow elements from start to end, as a stepper walks them. */
    readonly flowOrders: Readonly<Record<MergeSide, readonly string[]>>;
    /** Each side's element names by id, for a view that names an element its canvas does not draw. */
    readonly names: Readonly<Record<MergeSide, ReadonlyMap<string, string>>>;
    /** Each side's types by id, of the elements and of the parts inside them. */
    readonly types: Readonly<Record<MergeSide, ReadonlyMap<string, string>>>;
    /** The three texts of each element a hand merge can start from (`handMergeTextsOf`). */
    readonly handMergeTexts: ReadonlyMap<string, HandMergeTexts>;
    /** The moddle the snapshots read elements with: the versions' prefixes, no engine descriptor. */
    readonly snapshotModdle: PrefixedModdle;
}
