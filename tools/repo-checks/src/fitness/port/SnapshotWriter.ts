import type { Snapshot } from "../domain/snapshot";

export interface SnapshotWriter {
    write(snapshot: Snapshot): void;
}
