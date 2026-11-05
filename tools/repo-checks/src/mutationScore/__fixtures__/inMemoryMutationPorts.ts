import type { MutationRun } from "../domain/mutationRun";
import type { MutationRuns } from "../port/MutationRuns";
import type { MutationRunWriter } from "../port/MutationRunWriter";
import type { StrykerReports } from "../port/StrykerReports";

export class InMemoryMutationRuns implements MutationRuns {
    constructor(
        private readonly runs: readonly MutationRun[],
        private readonly chain: readonly string[],
    ) {}

    storedRuns(): readonly MutationRun[] {
        return this.runs;
    }

    firstParentChain(_repoRoot: string, commit: string): readonly string[] {
        return this.chain.slice(Math.max(this.chain.indexOf(commit), 0));
    }
}

export class InMemoryStrykerReports implements StrykerReports {
    constructor(private readonly byPath: Readonly<Record<string, unknown>>) {}

    read(path: string): unknown {
        return this.byPath[path];
    }
}

export class InMemoryMutationRunWriter implements MutationRunWriter {
    readonly written: MutationRun[] = [];

    write(run: MutationRun): void {
        this.written.push(run);
    }
}
