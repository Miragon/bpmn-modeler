import { loadBpmnModdle, type ModdleElement } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { generateLargeC7Model } from "../../../scripts/perf/largeBpmnModel.mjs";
import { layoutModelOf } from "./layoutModelReader";
import { introducedLayoutSpots } from "./layoutSpotDetection";

// The library types no host globals; the specs run in Node, which has a sub-millisecond clock.
declare const performance: { now(): number };

function fastestMillisecondsOf(run: () => unknown): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 5; attempt++) {
        const started = performance.now();
        run();
        fastest = Math.min(fastest, performance.now() - started);
    }
    return fastest;
}

/**
 * How long checking the result's spots against both sides takes, per millisecond spent reading
 * the three drawings: reading is linear, and both share the runner's load.
 */
function detectionPerReadingOf(result: ModdleElement, sides: readonly ModdleElement[]): number {
    const reading = fastestMillisecondsOf(() => [result, ...sides].map(layoutModelOf));
    const resultLayout = layoutModelOf(result);
    const sideLayouts = sides.map(layoutModelOf);
    const detection = fastestMillisecondsOf(() => introducedLayoutSpots(resultLayout, sideLayouts));
    return detection / reading;
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

// Measured on 1,400 and 2,000 nodes: detection takes 0.25 to 0.35 of the reading alone and up
// to 0.55 under the coverage run of the whole suite. A detector comparing every pair took
// 246 ms against 16 ms of reading, about 15, so the limit fails it and leaves room for noise.
const MAX_DETECTION_PER_READING = 2;

describe("layout spot detection time", () => {
    it.each([
        { label: "800 KB", rows: 28 },
        { label: "1.1 MB", rows: 40 },
    ])(
        "checks a $label file with nothing broken in less time than reading it",
        { timeout: 60_000 },
        async ({ rows }) => {
            const { xml } = generateLargeC7Model({ rows, perRow: 50 });
            const moddle = (await loadBpmnModdle())();
            const parse = async () => (await moddle.fromXML(xml)).rootElement;
            const [result, current, incoming] = await Promise.all([parse(), parse(), parse()]);

            expect(
                introducedLayoutSpots(
                    layoutModelOf(result),
                    [current, incoming].map(layoutModelOf),
                ),
            ).toEqual([]);
            expect(detectionPerReadingOf(result, [current, incoming])).toBeLessThan(
                MAX_DETECTION_PER_READING,
            );
        },
    );

    it(
        "checks an 800 KB file with moved tasks in less time than reading it",
        { timeout: 60_000 },
        async () => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
            const moddle = (await loadBpmnModdle())();
            const result = (await moddle.fromXML(withMovedTasks(xml))).rootElement;
            const side = (await moddle.fromXML(xml)).rootElement;

            const spots = introducedLayoutSpots(layoutModelOf(result), [
                layoutModelOf(side),
                layoutModelOf(side),
            ]);
            expect(spots.filter(({ kind }) => kind === "shapesOverlap")).toHaveLength(5);
            expect(detectionPerReadingOf(result, [side, side])).toBeLessThan(
                MAX_DETECTION_PER_READING,
            );
        },
    );
});
