import type { Snapshot } from "../domain/snapshot";

export interface SnapshotReader {
    /** Undefined when no snapshot is stored for the commit; throws on a corrupt one. */
    read(commit: string): Snapshot | undefined;
    /** The stored snapshots among the commits; throws on a corrupt one. */
    readHistory(commitsNewestFirst: readonly string[]): ReadonlyMap<string, Snapshot>;
}
