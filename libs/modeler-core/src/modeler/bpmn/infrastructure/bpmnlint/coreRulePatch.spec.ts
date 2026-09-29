import { BpmnModdle } from "bpmn-moddle";
import noOverlappingElements from "bpmnlint/rules/no-overlapping-elements";
import { describe, expect, it } from "vitest";

import {
    generateLargeC7Model,
    largeModelPresets,
} from "../../../../../../../scripts/perf/largeBpmnModel.mjs";

// The equivalence spec passes on unpatched bpmnlint too, so it cannot tell whether
// the yarn patch still applies. Unpatched `no-overlapping-elements` reads every
// shape's bounds once per pair; patched, a constant number of times per shape.
const MAX_BOUNDS_READS_PER_PLANE_ELEMENT = 10;

type RuleFactory = () => {
    check(node: unknown, reporter: { report(id: string, message: string): void }): void;
};

interface PlaneElementBoundsReads {
    planeElementCount: number;
    readCount(): number;
}

function countBoundsReads(definitions: Record<string, unknown>): PlaneElementBoundsReads {
    let boundsReads = 0;
    const diagrams = definitions.diagrams as { plane: { planeElement: object[] } }[];
    const planeElements = diagrams.flatMap((diagram) => diagram.plane.planeElement);

    for (const planeElement of planeElements) {
        const bounds = (planeElement as { bounds?: unknown }).bounds;
        Object.defineProperty(planeElement, "bounds", {
            get() {
                boundsReads++;
                return bounds;
            },
        });
    }

    return { planeElementCount: planeElements.length, readCount: () => boundsReads };
}

describe("bpmnlint core rule patch", () => {
    it("no-overlapping-elements reads bounds linearly in the plane element count", async () => {
        const { xml } = generateLargeC7Model(largeModelPresets[500]);
        const { rootElement: definitions } = await BpmnModdle().fromXML(xml);
        const boundsReads = countBoundsReads(definitions);

        (noOverlappingElements as RuleFactory)().check(definitions, { report: () => undefined });

        expect(boundsReads.readCount()).toBeLessThan(
            MAX_BOUNDS_READS_PER_PLANE_ELEMENT * boundsReads.planeElementCount,
        );
    });
});
