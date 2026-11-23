import type { ConflictMarkerReading } from "@miragon/bpmn-modeler-types/domain";
import { GitRefFacts } from "./conflictFacts";

/** The Git operation that left a file conflicted. */
export type GitOperation = "rebase" | "merge" | "cherryPick" | "stash" | "unknown";

// Git's label of the incoming side when `git stash pop` or `apply` conflicts; a stash sets no ref.
const STASH_INCOMING_LABEL = "Stashed changes";

/**
 * Which operation conflicted, from the refs in this order: a running rebase,
 * MERGE_HEAD, CHERRY_PICK_HEAD, then a stash by its marker label. A rebase
 * runs when the Git extension says so or REBASE_HEAD resolves while a rebase
 * folder exists: the extension looks only under `<root>/.git/` and misses a
 * linked worktree's rebase, and REBASE_HEAD alone outlives a finished one.
 */
export function gitOperationOf(refs: GitRefFacts, markers: ConflictMarkerReading): GitOperation {
    if (refs.rebaseCommit || (refs.rebaseInProgress && refs.rebaseHead)) return "rebase";
    if (refs.mergeHead) return "merge";
    if (refs.cherryPickHead) return "cherryPick";
    if (markers.hasMarkers && markers.incomingLabel === STASH_INCOMING_LABEL) return "stash";
    return "unknown";
}
