import { describe, expect, it } from "vitest";

import { flowClashesOf, runsOn } from "./layoutFlowClashes";
import type { Point } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel } from "./layoutModel";

const at = (x: number, y: number): Point => ({ x, y });

function flow(
    id: string,
    waypoints: readonly Point[],
    ends: Partial<Pick<LayoutEdge, "source" | "target" | "plane">> = {},
): LayoutEdge {
    return {
        id,
        plane: "Plane_1",
        source: `${id}_Source`,
        target: `${id}_Target`,
        waypoints,
        kind: "sequenceFlow",
        ...ends,
    };
}

const layoutOf = (...edges: LayoutEdge[]): LayoutModel => ({
    shapes: new Map(),
    edges: new Map(edges.map((edge) => [edge.id, edge])),
});

const ACROSS = flow("Flow_Across", [at(0, 50), at(200, 50)]);

describe("flowClashesOf", () => {
    it("counts each crossing of a flow with another", () => {
        const zigzag = flow("Flow_Z", [at(50, 0), at(50, 100), at(150, 100), at(150, 0)]);

        expect(flowClashesOf(layoutOf(ACROSS, zigzag), ["Flow_Z"])).toBe(2);
    });

    it("counts a flow that runs on another for more than 10 px once", () => {
        const along = flow("Flow_Along", [at(20, 0), at(20, 50), at(120, 50), at(120, 0)]);

        expect(flowClashesOf(layoutOf(ACROSS, along), ["Flow_Along"])).toBe(1);
    });

    it("does not count a flow that runs on another for 10 px or less", () => {
        const touching = flow("Flow_T", [at(20, 0), at(20, 50), at(30, 50), at(30, 0)]);

        expect(flowClashesOf(layoutOf(ACROSS, touching), ["Flow_T"])).toBe(0);
    });

    it("lets a flow run on one it shares its source or target with, as flows join there", () => {
        const fromSource = flow("Flow_S", [at(0, 50), at(100, 50), at(100, 0)], {
            source: ACROSS.source!,
        });
        const intoTarget = flow("Flow_T", [at(100, 100), at(100, 50), at(200, 50)], {
            target: ACROSS.target!,
        });

        expect(flowClashesOf(layoutOf(ACROSS, fromSource, intoTarget), ["Flow_S", "Flow_T"])).toBe(
            0,
        );
    });

    it("counts a flow that runs on another drawn without ends", () => {
        const loose = flow("Flow_Loose", [at(0, 50), at(200, 50)], {
            source: undefined,
            target: undefined,
        });
        const alsoLoose = flow("Flow_Also", [at(50, 50), at(150, 50)], {
            source: undefined,
            target: undefined,
        });

        expect(flowClashesOf(layoutOf(loose, alsoLoose), ["Flow_Also"])).toBe(1);
    });

    it("counts a clash between two of the flows once", () => {
        const down = flow("Flow_Down", [at(100, 0), at(100, 100)]);

        expect(flowClashesOf(layoutOf(ACROSS, down), ["Flow_Across", "Flow_Down"])).toBe(1);
    });

    it("ignores the flows of another plane and flows it does not know", () => {
        const elsewhere = flow("Flow_Else", [at(100, 0), at(100, 100)], { plane: "Plane_2" });

        expect(flowClashesOf(layoutOf(ACROSS, elsewhere), ["Flow_Across", "Flow_Gone"])).toBe(0);
    });
});

describe("runsOn", () => {
    const along = flow("Flow_Along", [at(20, 50), at(120, 50)]);

    it("tells a flow that runs on another for more than 10 px", () => {
        expect(runsOn(along, ACROSS)).toBe(true);
    });

    it("does not tell a flow that runs on another for 10 px or less", () => {
        expect(runsOn(flow("Flow_T", [at(20, 50), at(30, 50)]), ACROSS)).toBe(false);
    });

    it("lets a flow run on one it shares an end with", () => {
        expect(runsOn({ ...along, source: ACROSS.source! }, ACROSS)).toBe(false);
    });
});
