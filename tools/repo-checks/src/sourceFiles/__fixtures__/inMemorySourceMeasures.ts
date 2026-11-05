import type { FileMeasure } from "../domain/fileMeasure";
import type { SourceMeasures } from "../port/SourceMeasures";

export class InMemorySourceMeasures implements SourceMeasures {
    readonly reads: string[] = [];

    constructor(private readonly files: readonly FileMeasure[]) {}

    read(repoRoot: string): readonly FileMeasure[] {
        this.reads.push(repoRoot);
        return this.files;
    }
}
