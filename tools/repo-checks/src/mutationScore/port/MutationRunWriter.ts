import type { MutationRun } from "../domain/mutationRun";

export interface MutationRunWriter {
    write(run: MutationRun): void;
}
