import type { FileMeasure } from "../domain/fileMeasure";

export interface SourceMeasures {
    /** Every measured TypeScript file of the tree, sorted by path. */
    read(repoRoot: string): readonly FileMeasure[];
}
