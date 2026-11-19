import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { generateLargeC7Model } from "../../../scripts/perf/largeBpmnModel.mjs";
import { layoutModelOf } from "./layoutModelReader";
import { introducedLayoutSpots } from "./layoutSpotDetection";

// The library types no host globals; the specs run in Node, which has a sub-millisecond clock.
declare const performance: { now(): number };

async function fastestMillisecondsOf(run: () => unknown): Promise<number> {
    let fastest = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt++) {
        const started = performance.now();
        await run();
        fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
}

/**
 * How long checking the result's spots against both sides takes, per millisecond the build spends
 * parsing the result: both share the runner's load, and parsing is long enough that one slow or
 * fast round of either barely moves the ratio.
 */
async function detectionPerParseOf(resultXml: string, sideXmls: readonly string[]) {
    const moddle = (await loadBpmnModdle())();
    const parse = async (xml: string) => (await moddle.fromXML(xml)).rootElement;
    const parsing = await fastestMillisecondsOf(() => parse(resultXml));
    const result = layoutModelOf(await parse(resultXml));
    const sides = await Promise.all(sideXmls.map(async (xml) => layoutModelOf(await parse(xml))));
    const detect = () => introducedLayoutSpots(result, sides);
    return { spots: detect(), perParse: (await fastestMillisecondsOf(detect)) / parsing };
}

/** Moves every 200th task one row down, onto the task below it: five spots in a file of 1,400 nodes. */
function withMovedTasks(xml: string): string {
    let ordinal = 0;
    return xml.replace(
        /(bpmnElement="(?:svc|user)_\d+_\d+"><dc:Bounds x="\d+" y=")(\d+)"/g,
        (match, prefix: string, y: string) =>
            ++ordinal % 200 === 0 ? `${prefix}${Number(y) + 140}"` : match,
    );
}

// Measured against parsing the result once, best of five each, on 800 KB and 1.1 MB (90 and
// 125 ms to parse), with coverage: 0.06 to 0.07, and 0.013 to 0.09 in 75 runs beside the whole
// suite. With the grid left out, so that every shape is checked against every other, 8.6 to 10.
const MAX_DETECTION_PER_PARSE = 1;

describe("layout spot detection time", () => {
    it.each([
        { label: "800 KB", rows: 28 },
        { label: "1.1 MB", rows: 40 },
    ])(
        "checks a $label file with nothing broken in a fraction of parsing it",
        { timeout: 60_000 },
        async ({ rows }) => {
            const { xml } = generateLargeC7Model({ rows, perRow: 50 });

            const { spots, perParse } = await detectionPerParseOf(xml, [xml, xml]);

            expect(spots).toEqual([]);
            expect(perParse).toBeLessThan(MAX_DETECTION_PER_PARSE);
        },
    );

    it(
        "checks an 800 KB file with moved tasks in a fraction of parsing it",
        { timeout: 60_000 },
        async () => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });

            const { spots, perParse } = await detectionPerParseOf(withMovedTasks(xml), [xml, xml]);

            expect(spots.filter(({ kind }) => kind === "shapesOverlap")).toHaveLength(5);
            expect(perParse).toBeLessThan(MAX_DETECTION_PER_PARSE);
        },
    );
});
