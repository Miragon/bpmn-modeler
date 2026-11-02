import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { type Snapshot, serializeSnapshot, snapshotPath } from "../../domain/snapshot";
import type { SnapshotWriter } from "../../port/SnapshotWriter";

/** Lays the files out as on the data branch, so CI commits the directory as it is. */
export class SnapshotDirectory implements SnapshotWriter {
    constructor(private readonly outDir: string) {}

    write(snapshot: Snapshot): void {
        const file = join(this.outDir, snapshotPath(snapshot.commit));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, serializeSnapshot(snapshot));
    }
}
