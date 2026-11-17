import { EditorSubscription } from "../../editorSession/domain/EditorSession";
import { ConflictStageFacts } from "../domain/conflictFacts";

export type { ConflictStageFacts, ConflictStages, GitRefFacts } from "../domain/conflictFacts";

/** Where the core reads a conflicted file's Git stages and refs: the host's Git integration. */
export interface ConflictVersionsSource {
    /** Raw facts after a status refresh; the domain decides what they mean. */
    readConflict(fileUri: string): Promise<ConflictStageFacts>;
    /** Calls `listener` with every merge-change URI of every repository whenever that set changes. */
    watchMergeChanges(listener: (fileUris: readonly string[]) => void): EditorSubscription;
}
