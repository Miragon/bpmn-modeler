import type { MergeSide, MergeSideCaption } from "@miragon/bpmn-modeler-types";

import { ConflictMarkerReading } from "../../kernel/domain/conflictMarkers";
import { GitCommitFact, GitRefFacts } from "./conflictFacts";
import { GitOperation } from "./gitOperation";

// The Git extension's default `git.commitShortHashLength`.
const SHORT_HASH_LENGTH = 7;

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
        current: caption(
            "current",
            "unknown",
            markers.hasMarkers ? markers.currentLabel : undefined,
            undefined,
        ),
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

function incomingLabel(markers: ConflictMarkerReading): string | undefined {
    return markers.hasMarkers ? markers.incomingLabel : undefined;
}

function caption(
    side: MergeSide,
    role: MergeSideCaption["role"],
    ref: string | undefined,
    commit: GitCommitFact | undefined,
): MergeSideCaption {
    return {
        side,
        role,
        ...(ref === undefined ? {} : { ref }),
        ...(commit === undefined
            ? {}
            : { shortHash: commit.hash.slice(0, SHORT_HASH_LENGTH), subject: commit.subject }),
    };
}
