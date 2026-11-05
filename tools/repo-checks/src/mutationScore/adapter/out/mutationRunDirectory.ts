import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { type MutationRun, mutationRunPath, serializeMutationRun } from "../../domain/mutationRun";
import type { MutationRunWriter } from "../../port/MutationRunWriter";

/** Lays the run out as the data branch keeps it, for the workflow to commit. */
export class MutationRunDirectory implements MutationRunWriter {
    constructor(private readonly outDir: string) {}

    write(run: MutationRun): void {
        const file = join(this.outDir, mutationRunPath(run.runId));
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, serializeMutationRun(run));
    }
}
