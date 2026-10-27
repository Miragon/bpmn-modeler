import { describe, expect, it } from "vitest";

import { FetchReport, FetchVerdict, SourceFailure } from "./fetchReport";

const offline: SourceFailure = { source: 'github github.com/acme/one path "a"', reason: "offline" };
const rejected: SourceFailure = {
    source: 'github github.com/acme/two path "b"',
    reason: 'Rejected unsafe template path "../escape.json"',
};
const futureType = 'sources[2]: content type "palette-entries" is not supported by this version';

describe("FetchReport.verdict", () => {
    it.each<{
        behaviour: string;
        usableSources: number;
        sourceFailures: SourceFailure[];
        skippedTypes: string[];
        verdict: FetchVerdict;
    }>([
        {
            behaviour: "is complete when every usable source was fetched, even with no files",
            usableSources: 2,
            sourceFailures: [],
            skippedTypes: [],
            verdict: "complete",
        },
        {
            behaviour: "is complete for a manifest that lists no source",
            usableSources: 0,
            sourceFailures: [],
            skippedTypes: [],
            verdict: "complete",
        },
        {
            behaviour: "is partial when one of several usable sources failed",
            usableSources: 2,
            sourceFailures: [offline],
            skippedTypes: [],
            verdict: "partial",
        },
        {
            behaviour: "is partial when a type was skipped beside a fetched source",
            usableSources: 1,
            sourceFailures: [],
            skippedTypes: [futureType],
            verdict: "partial",
        },
        {
            behaviour: "fetched nothing when every usable source failed",
            usableSources: 2,
            sourceFailures: [offline, rejected],
            skippedTypes: [],
            verdict: "nothingFetched",
        },
        {
            behaviour: "fetched nothing when the only source failed beside a skipped type",
            usableSources: 1,
            sourceFailures: [offline],
            skippedTypes: [futureType],
            verdict: "nothingFetched",
        },
        {
            behaviour: "fetched nothing when no source was usable and a type was skipped",
            usableSources: 0,
            sourceFailures: [],
            skippedTypes: [futureType],
            verdict: "nothingFetched",
        },
    ])("$behaviour", ({ usableSources, sourceFailures, skippedTypes, verdict }) => {
        const report = FetchReport.of({ usableSources, cached: 0, sourceFailures, skippedTypes });

        expect(report.verdict()).toBe(verdict);
    });
});

describe("FetchReport.reasons", () => {
    it.each<{
        behaviour: string;
        sourceFailures: SourceFailure[];
        skippedTypes: string[];
        reasons: string[];
    }>([
        {
            behaviour: "names nothing when every source was fetched",
            sourceFailures: [],
            skippedTypes: [],
            reasons: [],
        },
        {
            behaviour: "names each failed source with its reason",
            sourceFailures: [offline, rejected],
            skippedTypes: [],
            reasons: [
                'github github.com/acme/one path "a": offline',
                'github github.com/acme/two path "b": Rejected unsafe template path "../escape.json"',
            ],
        },
        {
            behaviour: "lists the failed sources before the skipped types",
            sourceFailures: [offline],
            skippedTypes: [futureType],
            reasons: ['github github.com/acme/one path "a": offline', futureType],
        },
    ])("$behaviour", ({ sourceFailures, skippedTypes, reasons }) => {
        const report = FetchReport.of({
            usableSources: 2,
            cached: 1,
            sourceFailures,
            skippedTypes,
        });

        expect(report.reasons()).toEqual(reasons);
    });
});
