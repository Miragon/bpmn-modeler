import { loadBpmnModdle, type ModdleElement } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { generateLargeC7Model } from "../../../scripts/perf/largeBpmnModel.mjs";
import { layoutModelOf } from "./layoutModelReader";
import { introducedLayoutSpots } from "./layoutSpotDetection";

/** What the build adds for its layout notes: three drawings read and the result's spots checked against both sides. */
function introducedSpotsOf(result: ModdleElement, sides: readonly ModdleElement[]) {
    return introducedLayoutSpots(layoutModelOf(result), sides.map(layoutModelOf));
}

function fastestMillisecondsOf(run: () => unknown): number {
    let fastest = Number.POSITIVE_INFINITY;
    for (let attempt = 0; attempt < 3; attempt++) {
        const started = Date.now();
        run();
        fastest = Math.min(fastest, Date.now() - started);
    }
    return fastest;
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

// Measured locally: 16 ms for 1,400 nodes, 21 ms for 2,000. A detector comparing every pair took
// 246 ms on the 1,400; the budget fails that and leaves a slow CI runner ten times the time.
const BUDGET_MILLISECONDS = 200;

describe("layout spot detection time", () => {
    it.each([
        { label: "800 KB", rows: 28 },
        { label: "1.1 MB", rows: 40 },
    ])(
        "checks a $label file with nothing broken within the budget",
        { timeout: 60_000 },
        async ({ rows }) => {
            const { xml } = generateLargeC7Model({ rows, perRow: 50 });
            const moddle = (await loadBpmnModdle())();
            const parse = async () => (await moddle.fromXML(xml)).rootElement;
            const [result, current, incoming] = await Promise.all([parse(), parse(), parse()]);

            expect(introducedSpotsOf(result, [current, incoming])).toEqual([]);
            expect(
                fastestMillisecondsOf(() => introducedSpotsOf(result, [current, incoming])),
            ).toBeLessThan(BUDGET_MILLISECONDS);
        },
    );

    it(
        "checks an 800 KB file with moved tasks within the budget",
        { timeout: 60_000 },
        async () => {
            const { xml } = generateLargeC7Model({ rows: 28, perRow: 50 });
            const moddle = (await loadBpmnModdle())();
            const result = (await moddle.fromXML(withMovedTasks(xml))).rootElement;
            const side = (await moddle.fromXML(xml)).rootElement;

            const spots = introducedSpotsOf(result, [side, side]);
            expect(spots.filter(({ kind }) => kind === "shapesOverlap")).toHaveLength(5);
            expect(
                fastestMillisecondsOf(() => introducedSpotsOf(result, [side, side])),
            ).toBeLessThan(BUDGET_MILLISECONDS);
        },
    );
});
