/** `source` names the source as the log does; it never carries a token. */
export interface SourceFailure {
    readonly source: string;
    readonly reason: string;
}

export type FetchVerdict = "complete" | "partial" | "nothingFetched";

/** What one fetch of a marketplace's sources brought into the cache, and what it could not. */
export class FetchReport {
    private constructor(
        readonly usableSources: number,
        readonly cached: number,
        readonly sourceFailures: readonly SourceFailure[],
        readonly skippedTypes: readonly string[],
    ) {}

    static of(input: {
        usableSources: number;
        cached: number;
        sourceFailures: readonly SourceFailure[];
        skippedTypes: readonly string[];
    }): FetchReport {
        return new FetchReport(
            input.usableSources,
            input.cached,
            input.sourceFailures,
            input.skippedTypes,
        );
    }

    /**
     * A fetched source that serves no files still counts as fetched: an emptied
     * source is a valid refresh. A manifest without sources asked for nothing.
     */
    verdict(): FetchVerdict {
        if (this.sourceFailures.length < this.usableSources) {
            return this.sourceFailures.length === 0 && this.skippedTypes.length === 0
                ? "complete"
                : "partial";
        }
        return this.usableSources === 0 && this.skippedTypes.length === 0
            ? "complete"
            : "nothingFetched";
    }

    reasons(): string[] {
        return [
            ...this.sourceFailures.map(({ source, reason }) => `${source}: ${reason}`),
            ...this.skippedTypes,
        ];
    }
}
