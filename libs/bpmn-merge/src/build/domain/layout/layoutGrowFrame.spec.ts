import { describe, expect, it } from "vitest";

import { box, lane, layoutOf, node, pool } from "../../../__fixtures__/layoutShapes";
import { DrawingDraft } from "./layoutDrawingDraft";
import { FlowTopology } from "./layoutFlowTopology";
import { type FrameGrown, growFrameFor } from "./layoutGrowFrame";
import type { LayoutModel, LayoutShape } from "./layoutModel";
import { ShapeGroups } from "./layoutShapeGroups";

const IN_POOL = { pool: "Pool_1" };
const IN_SUB = { pool: "Pool_1", subProcesses: ["Sub_1"] };

function grownFor(layout: LayoutModel, id: string, frameIds: readonly string[]) {
    const draft = DrawingDraft.of(layout);
    const groups = new ShapeGroups(layout);
    const frames = frameIds.map((frame) => draft.shapes.get(frame)!);
    const context = { groups, topology: new FlowTopology(layout) };
    return growFrameFor(draft, context, groups.of(draft, draft.node(id)!), frames);
}

const boundsIn = (grown: FrameGrown | undefined, id: string) => grown?.draft.shapes.get(id)?.bounds;

describe("growFrameFor", () => {
    const wideBox = pool("Pool_1", box(0, 0, 1200, 600));

    it("grows a sub-process to every side, carrying the boundary events on the borders it grew", () => {
        const layout = layoutOf([
            wideBox,
            node("Sub_1", { ...IN_POOL, expanded: true, bounds: box(200, 100, 300, 200) }),
            node("Timer_L", { ...IN_POOL, host: "Sub_1", bounds: box(182, 200, 36, 36) }),
            node("Timer_B", { ...IN_POOL, host: "Sub_1", bounds: box(400, 282, 36, 36) }),
            node("Task_Z", { ...IN_SUB, bounds: box(150, 80) }),
        ]);

        const grown = grownFor(layout, "Task_Z", ["Sub_1"]);

        expect(boundsIn(grown, "Sub_1")).toEqual(box(140, 50, 360, 250));
        expect(boundsIn(grown, "Timer_L")).toEqual(box(122, 200, 36, 36));
        expect(boundsIn(grown, "Timer_B")).toEqual(box(400, 282, 36, 36));
        expect(grown?.shifted).toEqual([]);
        expect(grown?.moved).toEqual(["Timer_L"]);
    });

    it("shifts what a sub-process grown right lands on, across the height it grew to", () => {
        const layout = layoutOf([
            wideBox,
            node("Sub_1", { ...IN_POOL, expanded: true, bounds: box(200, 50, 300, 200) }),
            node("Task_Z", { ...IN_SUB, bounds: box(450, 200) }),
            node("Task_After", { ...IN_POOL, bounds: box(555, 282) }),
        ]);

        const grown = grownFor(layout, "Task_Z", ["Sub_1"]);

        expect(boundsIn(grown, "Sub_1")).toEqual(box(200, 50, 360, 240));
        expect(boundsIn(grown, "Task_After")).toEqual(box(615, 282));
        expect(grown?.shifted).toEqual(["Task_After"]);
    });

    it("grows the sub-process before the pool when the shape lies outside both", () => {
        const layout = layoutOf([
            wideBox,
            node("Sub_1", { ...IN_POOL, expanded: true, bounds: box(800, 100, 300, 200) }),
            node("Task_Z", { ...IN_SUB, bounds: box(1150, 150) }),
        ]);

        const grown = grownFor(layout, "Task_Z", ["Pool_1", "Sub_1"]);

        expect(boundsIn(grown, "Sub_1")).toEqual(box(800, 100, 460, 200));
        expect(boundsIn(grown, "Pool_1")).toEqual(box(0, 0, 1270, 600));
    });

    it("grows a pool with its lanes sideways", () => {
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 600, 200)),
            lane("Lane_1", box(30, 0, 570, 200), IN_POOL),
            node("Task_Z", { ...IN_POOL, lanes: ["Lane_1"], bounds: box(560, 60) }),
        ]);

        const grown = grownFor(layout, "Task_Z", ["Pool_1", "Lane_1"]);

        expect(boundsIn(grown, "Pool_1")).toEqual(box(0, 0, 670, 200));
        expect(boundsIn(grown, "Lane_1")).toEqual(box(30, 0, 640, 200));
        expect(grown?.shifted).toEqual([]);
    });

    it("grows no pool up or down", () => {
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 600, 200)),
            node("Task_Z", { ...IN_POOL, bounds: box(100, 150) }),
        ]);

        expect(grownFor(layout, "Task_Z", ["Pool_1"])).toBeUndefined();
    });

    it("grows no lane on its own", () => {
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 600, 200)),
            lane("Lane_1", box(30, 0, 570, 200), IN_POOL),
            node("Task_Z", { ...IN_POOL, lanes: ["Lane_1"], bounds: box(560, 60) }),
        ]);

        expect(grownFor(layout, "Task_Z", ["Lane_1"])).toBeUndefined();
    });

    it("shifts nothing beyond a pool, as the pool beside it stays", () => {
        const beside: LayoutShape = { ...pool("Pool_2", box(662, 0, 600, 200)) };
        const layout = layoutOf([
            pool("Pool_1", box(0, 0, 600, 200)),
            beside,
            node("Task_Z", { ...IN_POOL, bounds: box(560, 60) }),
        ]);

        expect(grownFor(layout, "Task_Z", ["Pool_1"])).toBeUndefined();
    });
});
