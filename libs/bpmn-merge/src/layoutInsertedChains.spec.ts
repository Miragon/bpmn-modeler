import { describe, expect, it } from "vitest";

import { box, flow, layoutOf, node } from "./__fixtures__/layoutShapes";
import { FlowTopology } from "./layoutFlowTopology";
import { InsertedChain } from "./layoutInsertedChains";
import type { LayoutEdge, LayoutModel, NodeShape } from "./layoutModel";
import { ShapeGroups } from "./layoutShapeGroups";

const task = (id: string, x: number, y = 100, relations: Partial<NodeShape> = {}) =>
    node(id, { bounds: box(x, y), ...relations });

const association = (id: string, source: string, target: string) =>
    flow(id, source, target, [], { kind: "association" });

const KEPT = [task("Task_A", 100), task("Task_B", 700)];

/**
 * What incoming added between Task_A and Task_B: two tasks in a row, the
 * first with a boundary event whose handler leads back into it, the second
 * with an annotation.
 */
const ADDED = [
    task("Task_N1", 250),
    node("Boundary_N", { bounds: box(262, 82, 36, 36), host: "Task_N1" }),
    task("Task_E", 250, -60),
    task("Task_N2", 400),
    node("Note_N", { bounds: box(400, 220, 100, 30) }),
];

const ADDED_FLOWS = [
    flow("Flow_AN", "Task_A", "Task_N1"),
    flow("Flow_N", "Task_N1", "Task_N2"),
    flow("Flow_NB", "Task_N2", "Task_B"),
    flow("Flow_Error", "Boundary_N", "Task_E"),
    flow("Flow_Retry", "Task_E", "Task_N1"),
    association("Association_N", "Task_N2", "Note_N"),
];

const CURRENT = layoutOf(KEPT, [flow("Flow_AB", "Task_A", "Task_B")]);
const INCOMING = layoutOf([...KEPT, ...ADDED], ADDED_FLOWS);
const SIDES = [CURRENT, INCOMING];

const chainOf = (layout: LayoutModel, id: string, sides: readonly LayoutModel[] = SIDES) =>
    InsertedChain.of(layout, sides, layout.shapes.get(id) as NodeShape);

const idsOf = (chain: InsertedChain | undefined) => chain?.nodes.map(({ id }) => id);

describe("InsertedChain", () => {
    it("is none for a shape both sides draw", () => {
        expect(chainOf(INCOMING, "Task_A")).toBeUndefined();
    });

    it.each(["Task_N1", "Task_E", "Task_N2", "Note_N", "Boundary_N"])(
        "holds every shape its side added that the side's flows join to %s, a boundary event with its host",
        (id) => {
            expect(idsOf(chainOf(INCOMING, id))).toEqual([
                "Task_N1",
                "Task_E",
                "Task_N2",
                "Note_N",
            ]);
        },
    );

    it("lists its shapes in the order of the drawing it is read in", () => {
        const result = layoutOf([...ADDED].reverse().concat(KEPT), ADDED_FLOWS);

        expect(idsOf(chainOf(result, "Task_N1"))).toEqual([
            "Note_N",
            "Task_N2",
            "Task_E",
            "Task_N1",
        ]);
    });

    it.each([
        {
            leftOut: "a shape its side added behind a shape both sides draw",
            shapes: [task("Task_N1", 250), task("Task_N3", 850)],
            flows: [flow("Flow_AN", "Task_A", "Task_N1"), flow("Flow_B3", "Task_B", "Task_N3")],
        },
        {
            leftOut: "a shape only a message flow joins",
            shapes: [task("Task_N1", 250), task("Task_N3", 250, 400)],
            flows: [flow("Flow_M", "Task_N1", "Task_N3", [], { kind: "messageFlow" })],
        },
        {
            leftOut: "a shape in another lane",
            shapes: [task("Task_N1", 250), task("Task_N3", 400, 100, { lanes: ["Lane_2"] })],
            flows: [flow("Flow_N", "Task_N1", "Task_N3")],
        },
        {
            leftOut: "a shape in a sub-process",
            shapes: [task("Task_N1", 250), task("Task_N3", 400, 100, { subProcesses: ["Sub_1"] })],
            flows: [flow("Flow_N", "Task_N1", "Task_N3")],
        },
    ])("leaves out $leftOut", ({ shapes, flows }) => {
        const incoming = layoutOf([...KEPT, ...shapes], flows);

        expect(idsOf(chainOf(incoming, "Task_N1", [CURRENT, incoming]))).toEqual(["Task_N1"]);
    });

    it("leaves out a shape its side's flow names without drawing it, which only the other side draws", () => {
        const undrawn = task("Task_U", 400);
        const flows = [flow("Flow_AN", "Task_A", "Task_N1"), flow("Flow_NU", "Task_N1", "Task_U")];
        const incoming = layoutOf([...KEPT, task("Task_N1", 250)], flows);
        const current = layoutOf([...KEPT, undrawn]);
        const result = layoutOf([...KEPT, task("Task_N1", 250), undrawn], flows);

        expect(idsOf(chainOf(result, "Task_N1", [current, incoming]))).toEqual(["Task_N1"]);
    });

    it("leaves out a shape the other side added, which only that side's flows join", () => {
        const current = layoutOf(
            [...KEPT, task("Task_X", 250)],
            [flow("Flow_AX", "Task_A", "Task_X")],
        );
        const result = layoutOf([...KEPT, ...ADDED, task("Task_X", 250)], ADDED_FLOWS);

        expect(idsOf(chainOf(result, "Task_N1", [current, INCOMING]))).toEqual([
            "Task_N1",
            "Task_E",
            "Task_N2",
            "Note_N",
        ]);
        expect(idsOf(chainOf(result, "Task_X", [current, INCOMING]))).toEqual(["Task_X"]);
    });

    it.each([
        { chain: "two tasks in a row", shapes: ADDED, flows: ADDED_FLOWS, several: true },
        {
            chain: "one task with its annotation",
            shapes: [task("Task_N1", 250), node("Note_N", { bounds: box(250, 220, 100, 30) })],
            flows: [
                flow("Flow_AN", "Task_A", "Task_N1"),
                association("Association_N", "Task_N1", "Note_N"),
            ],
            several: false,
        },
        {
            chain: "one task no flow joins",
            shapes: [task("Task_N1", 250)],
            flows: [] as LayoutEdge[],
            several: false,
        },
    ])("has several steps or not, counting what a sequence flow joins: $chain", (given) => {
        const incoming = layoutOf([...KEPT, ...given.shapes], given.flows);

        expect(chainOf(incoming, "Task_N1", [CURRENT, incoming])?.hasSeveralSteps).toBe(
            given.several,
        );
    });

    it.each([
        {
            joined: "a sequence flow joins it to another shape",
            flows: [ADDED_FLOWS[0]!],
            lies: true,
        },
        { joined: "no flow joins it", flows: [] as LayoutEdge[], lies: false },
        {
            joined: "only an association joins it",
            flows: [association("Association_A", "Task_A", "Task_N1")],
            lies: false,
        },
        {
            joined: "only its own boundary event leads back into it",
            flows: [flow("Flow_Retry", "Boundary_N", "Task_N1")],
            lies: false,
        },
    ])("lies in the flow or not when $joined", ({ flows, lies }) => {
        const boundary = node("Boundary_N", { bounds: box(262, 82, 36, 36), host: "Task_N1" });
        const incoming = layoutOf([...KEPT, task("Task_N1", 250), boundary], flows);

        expect(chainOf(incoming, "Task_N1", [CURRENT, incoming])?.liesInTheFlow).toBe(lies);
    });

    it("moves as one group led by its leftmost step: every shape with its boundary events, the flows between them inside, the others attached", () => {
        const group = chainOf(INCOMING, "Task_N2")!.groupIn(new ShapeGroups(INCOMING), INCOMING);

        expect(group.node.id).toBe("Task_N1");
        expect(group.members).toEqual(["Task_N1", "Boundary_N", "Task_E", "Task_N2", "Note_N"]);
        expect([...group.innerEdges].sort()).toEqual([
            "Association_N",
            "Flow_Error",
            "Flow_N",
            "Flow_Retry",
        ]);
        expect([...group.attachedEdges].sort()).toEqual(["Flow_AN", "Flow_NB"]);
    });

    it("leads its group with its leftmost step wherever the drawing lists it", () => {
        const result = layoutOf([...KEPT, ...[...ADDED].reverse()], ADDED_FLOWS);
        const group = chainOf(result, "Task_N2")!.groupIn(new ShapeGroups(result), result);

        expect(result.shapes.get(group.members[0]!)?.bounds.x).toBe(400);
        expect(group.node.bounds.x).toBe(250);
    });

    it("leads its group with a step, not with an annotation that reaches further left", () => {
        const note = node("Note_N", { bounds: box(150, 220, 100, 30) });
        const incoming = layoutOf(
            [...KEPT, task("Task_N1", 250), note],
            [
                flow("Flow_AN", "Task_A", "Task_N1"),
                association("Association_N", "Task_N1", "Note_N"),
            ],
        );
        const chain = chainOf(incoming, "Note_N", [CURRENT, incoming])!;

        expect(chain.groupIn(new ShapeGroups(incoming), incoming).node.id).toBe("Task_N1");
    });

    it("reads its group where the drawing draws its shapes now", () => {
        const chain = chainOf(INCOMING, "Task_N1")!;
        const moved = layoutOf(
            [...KEPT, ...ADDED.map((shape) => ({ ...shape, bounds: box(900, 100) }))],
            ADDED_FLOWS,
        );

        expect(chain.groupIn(new ShapeGroups(moved), moved).node.bounds).toEqual(box(900, 100));
    });

    it.each([
        { into: "the shape its last step flows into", id: "Task_B", leads: true },
        { into: "the shape that flows into it", id: "Task_A", leads: false },
    ])("leads into $into or not", ({ id, leads }) => {
        const kept = INCOMING.shapes.get(id) as NodeShape;

        expect(chainOf(INCOMING, "Task_N1")!.leadsInto(new FlowTopology(INCOMING), kept)).toBe(
            leads,
        );
    });

    it("leads into a boundary event when it flows into the event's host", () => {
        const onTaskB = node("Boundary_B", { bounds: box(712, 162, 36, 36), host: "Task_B" });
        const incoming = layoutOf([...KEPT, onTaskB, ...ADDED], ADDED_FLOWS);
        const current = layoutOf([...KEPT, onTaskB]);
        const chain = chainOf(incoming, "Task_N1", [current, incoming])!;

        expect(chain.leadsInto(new FlowTopology(incoming), onTaskB)).toBe(true);
    });

    it("leads into the shape a boundary event on one of its steps flows into", () => {
        const flows = [...ADDED_FLOWS, flow("Flow_Escalate", "Boundary_N", "Task_C")];
        const escalation = task("Task_C", 850);
        const incoming = layoutOf([...KEPT, escalation, ...ADDED], flows);
        const current = layoutOf([...KEPT, escalation]);

        expect(
            chainOf(incoming, "Task_N2", [current, incoming])!.leadsInto(
                new FlowTopology(incoming),
                escalation,
            ),
        ).toBe(true);
    });
});

describe("InsertedChain.toPutInLine", () => {
    const flowInto = (id: string) => flow(`Flow_Into_${id}`, "Task_A", id);
    const chainOfTasks = (prefix: string, count: number, y: number) =>
        Array.from({ length: count }, (_, at) =>
            task(`Task_${prefix}${at + 1}`, 250 + at * 150, y),
        );
    const flowsAlong = (chain: readonly NodeShape[]) =>
        chain.slice(1).map((next, at) => flow(`Flow_${next.id}`, chain[at]!.id, next.id));

    /** Current adds `ofCurrent` tasks in a row and incoming `ofIncoming`; the result's flow out of Task_A enters current's. */
    const orderOf = (ofCurrent: number, ofIncoming: number, incomingInFlow = true) => {
        const [x, y] = [chainOfTasks("X", ofCurrent, 100), chainOfTasks("Y", ofIncoming, 110)];
        const flowsOfIncoming = incomingInFlow ? [flowInto("Task_Y1"), ...flowsAlong(y)] : [];
        const current = layoutOf([...KEPT, ...x], [flowInto("Task_X1"), ...flowsAlong(x)]);
        const incoming = layoutOf([...KEPT, ...y], flowsOfIncoming);
        const result = layoutOf(
            [...KEPT, ...x, ...y],
            [flowInto("Task_X1"), ...flowsAlong(x), ...flowsAlong(y)],
        );
        const chain = (id: string) =>
            InsertedChain.of(result, [current, incoming], result.shapes.get(id) as NodeShape)!;
        const topology = new FlowTopology(result);
        return InsertedChain.toPutInLine(topology, chain("Task_Y1"), chain("Task_X1"))?.map(
            ({ nodes }) => nodes[0]!.id,
        );
    };

    it.each([
        { chains: "two chains of several steps", order: orderOf(2, 2), inLine: true },
        { chains: "a single step and a chain", order: orderOf(1, 2), inLine: true },
        { chains: "a chain and a single step", order: orderOf(2, 1), inLine: true },
        { chains: "two single steps", order: orderOf(1, 1), inLine: false },
        { chains: "a chain and a shape no flow joins", order: orderOf(2, 1, false), inLine: false },
    ])("puts $chains in line in the order of the flows, or not: $inLine", ({ order, inLine }) => {
        expect(order).toEqual(inLine ? ["Task_X1", "Task_Y1"] : undefined);
    });
});

describe("InsertedChain.inFlowOrder", () => {
    const X = [task("Task_X1", 250), task("Task_X2", 400)];
    const Y = [task("Task_Y1", 260), task("Task_Y2", 410)];
    const current = layoutOf(
        [...KEPT, ...X],
        [
            flow("Flow_AX", "Task_A", "Task_X1"),
            flow("Flow_X", "Task_X1", "Task_X2"),
            flow("Flow_XB", "Task_X2", "Task_B"),
        ],
    );
    const incoming = layoutOf(
        [...KEPT, ...Y],
        [
            flow("Flow_AY", "Task_A", "Task_Y1"),
            flow("Flow_Y", "Task_Y1", "Task_Y2"),
            flow("Flow_YB", "Task_Y2", "Task_B"),
        ],
    );
    const INSIDE = [flow("Flow_X", "Task_X1", "Task_X2"), flow("Flow_Y", "Task_Y1", "Task_Y2")];
    const LEAVING = [flow("Flow_XB", "Task_X2", "Task_B"), flow("Flow_YB", "Task_Y2", "Task_B")];
    const INTO_X = flow("Flow_AX", "Task_A", "Task_X1");
    const INTO_Y = flow("Flow_AY", "Task_A", "Task_Y1");

    const orderIn = (flows: readonly LayoutEdge[]) => {
        const result = layoutOf([...KEPT, ...X, ...Y], [...INSIDE, ...flows]);
        const chain = (id: string) =>
            InsertedChain.of(result, [current, incoming], result.shapes.get(id) as NodeShape)!;
        const topology = new FlowTopology(result);
        return InsertedChain.inFlowOrder(topology, chain("Task_X2"), chain("Task_Y2"))?.map(
            ({ nodes }) => nodes[0]!.id,
        );
    };

    it.each([
        {
            flows: "a flow leads from the first into the second",
            given: [INTO_X, flow("Flow_XY", "Task_X2", "Task_Y1"), LEAVING[1]!],
            order: ["Task_X1", "Task_Y1"],
        },
        {
            flows: "a flow leads from the second into the first",
            given: [INTO_Y, flow("Flow_YX", "Task_Y2", "Task_X1"), LEAVING[0]!],
            order: ["Task_Y1", "Task_X1"],
        },
        {
            flows: "a flow leads from the first into the second and one from outside enters each",
            given: [INTO_X, INTO_Y, flow("Flow_XY", "Task_X2", "Task_Y1"), LEAVING[1]!],
            order: ["Task_X1", "Task_Y1"],
        },
        {
            flows: "a flow leads from the second into the first and none enters them",
            given: [flow("Flow_YX", "Task_Y2", "Task_X1"), LEAVING[0]!],
            order: ["Task_Y1", "Task_X1"],
        },
        {
            flows: "a flow from outside enters only the first",
            given: [INTO_X, ...LEAVING],
            order: ["Task_X1", "Task_Y1"],
        },
        {
            flows: "a flow from outside enters only the second",
            given: [INTO_Y, ...LEAVING],
            order: ["Task_Y1", "Task_X1"],
        },
        {
            flows: "a flow from outside enters each, as two branches",
            given: [INTO_X, INTO_Y, ...LEAVING],
            order: undefined,
        },
        { flows: "no flow enters either", given: LEAVING, order: undefined },
        {
            flows: "flows lead from each into the other and none enters them",
            given: [flow("Flow_XY", "Task_X2", "Task_Y1"), flow("Flow_YX", "Task_Y2", "Task_X1")],
            order: undefined,
        },
        {
            flows: "flows lead from each into the other and one from outside enters the second",
            given: [
                INTO_Y,
                flow("Flow_XY", "Task_X2", "Task_Y1"),
                flow("Flow_YX", "Task_Y2", "Task_X1"),
            ],
            order: ["Task_Y1", "Task_X1"],
        },
    ])("puts the chains in the order of the flows when $flows", ({ given, order }) => {
        expect(orderIn(given)).toEqual(order);
    });
});
