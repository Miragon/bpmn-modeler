import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { describe, expect, it } from "vitest";

import { generateLargeC7Model } from "../../../scripts/perf/largeBpmnModel.mjs";
import { withShiftedTasks } from "./__fixtures__/shiftedTasks";
import { perParseOf } from "./__fixtures__/timeAgainstParsing";
import { layoutModelOf } from "./layoutModelReader";
import { introducedLayoutSpots } from "./layoutSpotDetection";

/** The spots of the result against both sides, and how long finding them takes per millisecond of parsing the result. */
async function detectionPerParseOf(resultXml: string, sideXmls: readonly string[]) {
    const moddle = (await loadBpmnModdle())();
    const layoutOf = async (xml: string) => layoutModelOf((await moddle.fromXML(xml)).rootElement);
    const result = await layoutOf(resultXml);
    const sides = await Promise.all(sideXmls.map(layoutOf));
    const detect = () => introducedLayoutSpots(result, sides);
    return { spots: detect(), perParse: await perParseOf(resultXml, detect) };
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

            const { spots, perParse } = await detectionPerParseOf(withShiftedTasks(xml, 0, 140), [
                xml,
                xml,
            ]);

            expect(spots.filter(({ kind }) => kind === "shapesOverlap")).toHaveLength(5);
            expect(perParse).toBeLessThan(MAX_DETECTION_PER_PARSE);
        },
    );
});
