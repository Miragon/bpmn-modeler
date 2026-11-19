import type {
    ConflictMarkerReading,
    MergeSide,
    MergeSideCaption,
} from "@miragon/bpmn-modeler-types";

import { isFullCommitHash, shortCommitHash } from "./commitHash";
import { GitCommitFact, GitRefFacts } from "./conflictFacts";
import { GitOperation } from "./gitOperation";

type Captions = Record<MergeSide, MergeSideCaption>;

/**
 * How each operation names its sides. Current is always stage 2 and incoming
 * stage 3; during a rebase stage 3 is the user's own commit, so the roles
 * swap while the panes stay where they are.
 */
const CAPTIONS_OF: Record<
    GitOperation,
    (refs: GitRefFacts, markers: ConflictMarkerReading) => Captions
> = {
    merge: (refs, markers) => ({
        current: caption("current", "branch", refs.headName, refs.head),
        incoming: caption("incoming", "upstream", incomingLabel(markers), refs.mergeHead),
    }),
    rebase: (refs) => ({
        current: caption("current", "upstream", undefined, refs.head),
        incoming: caption(
            "incoming",
            "yourCommit",
            undefined,
            refs.rebaseHead ?? refs.rebaseCommit,
        ),
    }),
    cherryPick: (refs) => ({
        current: caption("current", "branch", refs.headName, refs.head),
        incoming: caption("incoming", "upstream", undefined, refs.cherryPickHead),
    }),
    stash: (refs) => ({
        current: caption("current", "branch", refs.headName, refs.head),
        incoming: caption("incoming", "stash", undefined, undefined),
    }),
    unknown: (_refs, markers) => ({
        current: caption("current", "unknown", currentLabel(markers), undefined),
        incoming: caption("incoming", "unknown", incomingLabel(markers), undefined),
    }),
};

/** The caption of each pane as data; the webview composes the translated words. */
export function mergeSideCaptions(
    operation: GitOperation,
    refs: GitRefFacts,
    markers: ConflictMarkerReading,
): Captions {
    return CAPTIONS_OF[operation](refs, markers);
}

function currentLabel(markers: ConflictMarkerReading): string | undefined {
    return markers.hasMarkers ? markers.currentLabel : undefined;
}

function incomingLabel(markers: ConflictMarkerReading): string | undefined {
    return markers.hasMarkers ? markers.incomingLabel : undefined;
}

function caption(
    side: MergeSide,
    role: MergeSideCaption["role"],
    ref: string | undefined,
    commit: GitCommitFact | undefined,
): MergeSideCaption {
    const shownRef = refShown(ref, commit);
    return {
        side,
        role,
        ...(shownRef === undefined ? {} : { ref: shownRef }),
        ...(commit === undefined
            ? {}
            : { shortHash: shortCommitHash(commit.hash), subject: commit.subject }),
    };
}

// `git pull` labels its markers with the merged commit's full hash: name the commit once, cut.
function refShown(ref: string | undefined, commit: GitCommitFact | undefined): string | undefined {
    if (ref === undefined || !isFullCommitHash(ref)) return ref;
    return commit === undefined ? shortCommitHash(ref) : undefined;
}
