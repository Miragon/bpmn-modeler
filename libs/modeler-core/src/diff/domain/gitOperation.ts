import { ConflictMarkerReading } from "../../kernel/domain/conflictMarkers";
import { GitRefFacts } from "./conflictFacts";

/** The Git operation that left a file conflicted. */
export type GitOperation = "rebase" | "merge" | "cherryPick" | "stash" | "unknown";

// Git's label of the incoming side when `git stash pop` or `apply` conflicts; a stash sets no ref.
const STASH_INCOMING_LABEL = "Stashed changes";

/**
 * Which operation conflicted, from the refs in this order: REBASE_HEAD, the
 * Git extension's rebase commit, MERGE_HEAD, CHERRY_PICK_HEAD, then a stash by
 * its marker label. REBASE_HEAD comes first because the extension's rebase
 * state looks only under `<root>/.git/` and misses a linked worktree's rebase.
 */
export function gitOperationOf(refs: GitRefFacts, markers: ConflictMarkerReading): GitOperation {
    if (refs.rebaseHead || refs.rebaseCommit) return "rebase";
    if (refs.mergeHead) return "merge";
    if (refs.cherryPickHead) return "cherryPick";
    if (markers.hasMarkers && markers.incomingLabel === STASH_INCOMING_LABEL) return "stash";
    return "unknown";
}
