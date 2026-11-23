import { describe, expect, it } from "vitest";

import { at, box, flow, layoutOf, node as nodeWith } from "./__fixtures__/layoutShapes";
import { rootPlane } from "./__fixtures__/shapePlane";
import type { DiagramBounds } from "./layoutGeometry";
import type { LayoutEdge, LayoutModel, NodeShape } from "./layoutModel";
import { placeBesideNeighbours } from "./layoutNeighbourPlacement";

const node = (id: string, bounds: DiagramBounds, relations: Partial<NodeShape> = {}) =>
    nodeWith(id, { bounds, ...relations });

const IN_SUB = { subProcesses: ["Sub_1"] };

const boundsIn = (layout: LayoutModel, id: string) => layout.shapes.get(id)?.bounds;

/** The task one side added, drawn 50 right of `Task_A` at (100, 100) and on its row. */
const ADDED = node("Task_N", box(250, 100));

/** The other side's drawing: `Task_A` and `Task_B` without the added task. */
const sideWithout = (a: DiagramBounds, b: DiagramBounds = box(400, 100)) =>
    layoutOf([node("Task_A", a), node("Task_B", b)], [flow("Flow_AB", "Task_A", "Task_B")]);

/** The adding side's drawing: `Task_A`, the added task, `Task_B`, joined in a line. */
const sideWith = (
    added: NodeShape = ADDED,
    b: DiagramBounds = box(400, 100),
    edges: readonly LayoutEdge[] = [
        flow("Flow_AN", "Task_A", added.id),
        flow("Flow_NB", added.id, "Task_B"),
    ],
) => layoutOf([node("Task_A", box(100, 100)), added, node("Task_B", b)], edges);

/** The result: both tasks where the other side moved them, the added task where its side drew it. */
const resultWith = (
    a: DiagramBounds,
    b: DiagramBounds,
    added: readonly NodeShape[] = [ADDED],
    edges: readonly LayoutEdge[] = [],
) => layoutOf([node("Task_A", a), ...added, node("Task_B", b)], edges);

describe("placeBesideNeighbours", () => {
    it.each([
        {
            moved: "both neighbours down and right",
            a: box(300, 220),
            b: box(600, 220),
            placed: box(450, 220),
        },
        {
            moved: "only the predecessor, which it follows",
            a: box(100, 160),
            b: box(400, 100),
            placed: box(250, 160),
        },
        {
            moved: "the predecessor wider, keeping the gap to its right border",
            a: box(100, 100, 160, 80),
            b: box(400, 100),
            placed: box(310, 100),
        },
    ])(
        "keeps a shape one side added beside its predecessor when the other side moved $moved",
        ({ a, b, placed }) => {
            const result = resultWith(a, b);

            const placedLayout = placeBesideNeighbours(result, [sideWith(), sideWithout(a, b)]);

            expect(boundsIn(placedLayout, "Task_N")).toEqual(placed);
            expect(boundsIn(placedLayout, "Task_A")).toEqual(a);
            expect(boundsIn(placedLayout, "Task_B")).toEqual(b);
        },
    );

    it("follows its successor, keeping the gap to its left border, when its side drew no predecessor", () => {
        const edges = [flow("Flow_NB", "Task_N", "Task_B")];
        const result = resultWith(box(100, 100), box(500, 140));

        const placedLayout = placeBesideNeighbours(result, [
            sideWith(ADDED, box(400, 100), edges),
            sideWithout(box(100, 100), box(500, 140)),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(350, 140));
    });

    it("keeps the gap to the bottom border of a predecessor its side drew above it", () => {
        const below = node("Task_N", box(100, 230));
        const edges = [flow("Flow_AN", "Task_A", "Task_N")];
        const adding = layoutOf([node("Task_A", box(100, 100)), below], edges);
        const result = layoutOf([node("Task_A", box(140, 100, 100, 120)), below]);

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            layoutOf([node("Task_A", box(140, 100, 100, 120))]),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(140, 270));
    });

    it.each([
        {
            lies: "left of its predecessor, on a flow back",
            neighbour: { side: box(250, 100), result: box(250, 100, 200, 80) },
            shape: box(100, 100),
            edge: flow("Flow_AN", "Task_A", "Task_N"),
            placed: box(100, 100),
        },
        {
            lies: "right of its successor, on a flow back",
            neighbour: { side: box(100, 100, 250, 80), result: box(100, 100, 400, 80) },
            shape: box(400, 100),
            edge: flow("Flow_NA", "Task_N", "Task_A"),
            placed: box(550, 100),
        },
        {
            lies: "above a predecessor the other side made taller",
            neighbour: { side: box(100, 300, 300, 200), result: box(100, 300, 300, 400) },
            shape: box(200, 150),
            edge: flow("Flow_AN", "Task_A", "Task_N"),
            placed: box(200, 150),
        },
    ])(
        "keeps its gap to the border it faces when it lies $lies",
        ({ neighbour, shape, edge, placed }) => {
            const added = node("Task_N", shape);
            const result = layoutOf([node("Task_A", neighbour.result), added]);

            const placedLayout = placeBesideNeighbours(result, [
                layoutOf([node("Task_A", neighbour.side), added], [edge]),
                layoutOf([node("Task_A", neighbour.result)]),
            ]);

            expect(boundsIn(placedLayout, "Task_N")).toEqual(placed);
        },
    );

    it("keeps its gap to the bottom border of a predecessor its side drew further above it than beside it", () => {
        const diagonal = node("Task_N", box(250, 330));
        const result = layoutOf([node("Task_A", box(100, 100, 100, 120)), diagonal]);

        const placedLayout = placeBesideNeighbours(result, [
            layoutOf(
                [node("Task_A", box(100, 100)), diagonal],
                [flow("Flow_AN", "Task_A", "Task_N")],
            ),
            layoutOf([node("Task_A", box(100, 100, 100, 120))]),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(250, 370));
    });

    it("keeps its gap along the row beside a tall predecessor whose middle lies far above it", () => {
        const tall = { side: box(100, 0, 300, 600), result: box(100, 0, 340, 600) };
        const added = node("Task_N", box(420, 520));
        const result = layoutOf([node("Sub_A", tall.result), added]);

        const placedLayout = placeBesideNeighbours(result, [
            layoutOf([node("Sub_A", tall.side), added], [flow("Flow_AN", "Sub_A", "Task_N")]),
            layoutOf([node("Sub_A", tall.result)]),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(460, 520));
    });

    it("follows its sequence predecessor before a data store its side associated it with first", () => {
        const store = { side: box(250, 300, 50, 50), result: box(250, 400, 50, 50) };
        const edges = [
            flow("Assoc_1", "Store_1", "Task_N", [], { kind: "association" }),
            flow("Flow_AN", "Task_A", "Task_N"),
        ];
        const result = layoutOf([
            node("Task_A", box(100, 160)),
            node("Store_1", store.result),
            ADDED,
        ]);

        const placedLayout = placeBesideNeighbours(result, [
            layoutOf([node("Task_A", box(100, 100)), node("Store_1", store.side), ADDED], edges),
            layoutOf([node("Task_A", box(100, 160)), node("Store_1", store.result)]),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(250, 160));
    });

    it("follows a neighbour its side draws on the process's plane where the result draws on the collaboration's", () => {
        const onProcessPlane = rootPlane("Process_1", "Collaboration_1");
        const adding = layoutOf(
            [node("Task_A", box(100, 100), onProcessPlane), { ...ADDED, ...onProcessPlane }],
            [flow("Flow_AN", "Task_A", "Task_N", [], { plane: "Process_1" })],
        );
        const result = resultWith(box(100, 160), box(400, 160));

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            sideWithout(box(100, 160), box(400, 160)),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(250, 160));
    });

    it("follows the neighbours its side drew, even where the result dropped the flow", () => {
        const result = resultWith(box(300, 220), box(600, 220));

        const placedLayout = placeBesideNeighbours(result, [
            sideWith(),
            sideWithout(box(300, 220), box(600, 220)),
        ]);

        expect(result.edges.size).toBe(0);
        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(450, 220));
    });

    it("keeps a chain of added shapes beside the neighbour the first one follows, in any order the result lists them", () => {
        const second = node("Task_M", box(400, 100));
        const third = node("Task_L", box(550, 100));
        const edges = [
            flow("Flow_AN", "Task_A", "Task_N"),
            flow("Flow_NM", "Task_N", "Task_M"),
            flow("Flow_ML", "Task_M", "Task_L"),
        ];
        const adding = layoutOf([node("Task_A", box(100, 100)), ADDED, second, third], edges);
        const result = layoutOf([node("Task_A", box(100, 200)), third, second, ADDED]);

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            layoutOf([node("Task_A", box(100, 200))]),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(250, 200));
        expect(boundsIn(placedLayout, "Task_M")).toEqual(box(400, 200));
        expect(boundsIn(placedLayout, "Task_L")).toEqual(box(550, 200));
    });

    it("keeps the last shape of a chain behind the shapes its side added before it, not beside a successor the other side drew elsewhere", () => {
        const last = node("Task_M", box(400, 100));
        const edges = [
            flow("Flow_AN", "Task_A", "Task_N"),
            flow("Flow_NM", "Task_N", "Task_M"),
            flow("Flow_MB", "Task_M", "Task_B"),
        ];
        const adding = layoutOf(
            [node("Task_A", box(100, 100)), ADDED, last, node("Task_B", box(550, 100))],
            edges,
        );
        const result = resultWith(box(100, 200), box(250, 200), [ADDED, last]);

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            sideWithout(box(100, 200), box(250, 200)),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(250, 200));
        expect(boundsIn(placedLayout, "Task_M")).toEqual(box(400, 200));
    });

    it("follows the successor both sides draw when the shapes its side added before it lead only to it", () => {
        const first = node("Start_N", box(100, 300, 36, 36));
        const second = node("Task_M", box(250, 278));
        const edges = [flow("Flow_NM", "Start_N", "Task_M"), flow("Flow_MB", "Task_M", "Task_B")];
        const adding = layoutOf(
            [node("Task_A", box(100, 100)), first, second, node("Task_B", box(400, 278))],
            edges,
        );
        const result = resultWith(box(100, 100), box(400, 338), [first, second]);

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            sideWithout(box(100, 100), box(400, 338)),
        ]);

        expect(boundsIn(placedLayout, "Task_M")).toEqual(box(250, 338));
        expect(boundsIn(placedLayout, "Start_N")).toEqual(box(100, 360, 36, 36));
    });

    it("follows a neighbour both sides draw past a shape its side added in another lane", () => {
        const inLane = { lanes: ["Lane_1"] };
        const added = { ...ADDED, ...inLane };
        const before = node("Task_L", box(250, 300), { lanes: ["Lane_2"] });
        const edges = [flow("Flow_LN", "Task_L", "Task_N"), flow("Flow_NB", "Task_N", "Task_B")];
        const adding = layoutOf(
            [
                node("Task_A", box(100, 100), inLane),
                before,
                added,
                node("Task_B", box(400, 100), inLane),
            ],
            edges,
        );
        const moved = [
            node("Task_A", box(100, 100), inLane),
            node("Task_B", box(400, 130), inLane),
        ];

        const placedLayout = placeBesideNeighbours(layoutOf([...moved, before, added]), [
            adding,
            layoutOf(moved),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(250, 130));
    });

    it("moves the flows between added shapes that move alike with them, labels included, and leaves the others as drawn", () => {
        const second = node("Task_M", box(400, 100));
        const between = flow("Flow_NM", "Task_N", "Task_M", [at(350, 140), at(400, 140)], {
            label: box(360, 115, 30, 14),
        });
        const entering = flow("Flow_AN", "Task_A", "Task_N", [at(200, 140), at(250, 140)]);
        const adding = layoutOf(
            [node("Task_A", box(100, 100)), ADDED, second],
            [entering, between],
        );
        const result = layoutOf(
            [node("Task_A", box(100, 200)), ADDED, second],
            [entering, between],
        );

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            layoutOf([node("Task_A", box(100, 200))]),
        ]);

        expect(placedLayout.edges.get("Flow_NM")).toEqual({
            ...between,
            waypoints: [at(350, 240), at(400, 240)],
            label: box(360, 215, 30, 14),
        });
        expect(placedLayout.edges.get("Flow_AN")).toBe(entering);
    });

    it("leaves a flow between added shapes that move differently as drawn", () => {
        const second = node("Task_M", box(400, 300));
        const between = flow("Flow_NM", "Task_N", "Task_M", [at(300, 180), at(450, 300)]);
        const edges = [
            flow("Flow_AN", "Task_A", "Task_N"),
            flow("Flow_BM", "Task_B", "Task_M"),
            between,
        ];
        const adding = layoutOf(
            [node("Task_A", box(100, 100)), ADDED, second, node("Task_B", box(250, 300))],
            edges,
        );
        const result = resultWith(box(100, 160), box(250, 340), [ADDED, second], [between]);

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            sideWithout(box(100, 160), box(250, 340)),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(250, 160));
        expect(boundsIn(placedLayout, "Task_M")).toEqual(box(400, 340));
        expect(placedLayout.edges.get("Flow_NM")).toBe(between);
    });

    it("follows the added task whose boundary event leads into it, and the task both sides draw whose added boundary event does", () => {
        const onAdded = node("Boundary_N", box(282, 162, 36, 36), { host: "Task_N" });
        const onKept = node("Boundary_A", box(132, 162, 36, 36), { host: "Task_A" });
        const afterAdded = node("Task_E", box(250, 260));
        const afterKept = node("Task_F", box(100, 260));
        const edges = [
            flow("Flow_AN", "Task_A", "Task_N"),
            flow("Flow_E", "Boundary_N", "Task_E"),
            flow("Flow_F", "Boundary_A", "Task_F"),
        ];
        const adding = layoutOf(
            [node("Task_A", box(100, 100)), ADDED, onAdded, onKept, afterAdded, afterKept],
            edges,
        );
        const result = layoutOf([
            node("Task_A", box(100, 400)),
            ADDED,
            onAdded,
            onKept,
            afterAdded,
            afterKept,
        ]);

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            layoutOf([node("Task_A", box(100, 400))]),
        ]);

        expect(boundsIn(placedLayout, "Task_N")).toEqual(box(250, 400));
        expect(boundsIn(placedLayout, "Task_E")).toEqual(box(250, 560));
        expect(boundsIn(placedLayout, "Task_F")).toEqual(box(100, 560));
    });

    it("moves an added shape's boundary events and, drawn open, its contents with it", () => {
        const sub = node("Sub_1", box(250, 60, 200, 160), { expanded: true });
        const inside = node("Task_In", box(300, 100), IN_SUB);
        const boundary = node("Boundary_1", box(332, 202, 36, 36), { host: "Sub_1" });
        const edges = [flow("Flow_AS", "Task_A", "Sub_1")];
        const adding = layoutOf([node("Task_A", box(100, 100)), sub, inside, boundary], edges);
        const other = layoutOf([node("Task_A", box(100, 150))]);
        const result = layoutOf([node("Task_A", box(100, 150)), sub, inside, boundary]);

        const placedLayout = placeBesideNeighbours(result, [adding, other]);

        expect(boundsIn(placedLayout, "Sub_1")).toEqual(box(250, 110, 200, 160));
        expect(boundsIn(placedLayout, "Task_In")).toEqual(box(300, 150));
        expect(boundsIn(placedLayout, "Boundary_1")).toEqual(box(332, 252, 36, 36));
    });

    it.each([
        {
            case: "its neighbours lie where its side drew them",
            result: resultWith(box(100, 100), box(400, 100)),
            sides: [sideWith(), sideWithout(box(100, 100))],
        },
        {
            case: "both sides draw it",
            result: resultWith(box(100, 160), box(400, 160)),
            sides: [
                sideWith(),
                layoutOf([...sideWithout(box(100, 160), box(400, 160)).shapes.values(), ADDED]),
            ],
        },
        {
            case: "the build drew it elsewhere than its side",
            result: resultWith(box(100, 160), box(400, 160), [node("Task_N", box(250, 300))]),
            sides: [sideWith(), sideWithout(box(100, 160), box(400, 160))],
        },
        {
            case: "only a message flow joins it to the moved shape",
            result: resultWith(box(100, 160), box(400, 160)),
            sides: [
                sideWith(ADDED, box(400, 100), [
                    flow("Flow_M", "Task_A", "Task_N", [], { kind: "messageFlow" }),
                ]),
                sideWithout(box(100, 160), box(400, 160)),
            ],
        },
        {
            case: "the result draws its neighbour in a sub-process it does not lie in",
            result: layoutOf([
                node("Sub_1", box(60, 60, 220, 240), { expanded: true }),
                node("Task_A", box(100, 160), IN_SUB),
                ADDED,
                node("Task_B", box(400, 100)),
            ]),
            sides: [sideWith(), sideWithout(box(100, 160), box(400, 100))],
        },
        {
            case: "the other side moved its neighbour into another lane",
            result: layoutOf([
                node("Task_A", box(100, 260), { lanes: ["Lane_2"] }),
                { ...ADDED, lanes: ["Lane_1"] },
                node("Task_B", box(400, 100), { lanes: ["Lane_1"] }),
            ]),
            sides: [
                layoutOf(
                    [
                        node("Task_A", box(100, 100), { lanes: ["Lane_1"] }),
                        { ...ADDED, lanes: ["Lane_1"] },
                        node("Task_B", box(400, 100), { lanes: ["Lane_1"] }),
                    ],
                    [flow("Flow_AN", "Task_A", "Task_N")],
                ),
                layoutOf([
                    node("Task_A", box(100, 260), { lanes: ["Lane_2"] }),
                    node("Task_B", box(400, 100), { lanes: ["Lane_1"] }),
                ]),
            ],
        },
    ])("leaves the drawing as it is when $case", ({ result, sides }) => {
        expect(placeBesideNeighbours(result, sides)).toBe(result);
    });

    it("moves the contents of an added sub-process once, with the sub-process, even when joined to another added shape", () => {
        const sub = node("Sub_1", box(250, 60, 200, 160), { expanded: true });
        const inside = node("Task_In", box(300, 100), IN_SUB);
        const note = node("Note_1", box(300, 300, 100, 30));
        const edges = [
            flow("Flow_AS", "Task_A", "Sub_1"),
            flow("Flow_AN", "Task_A", "Note_1", [], { kind: "association" }),
            flow("Assoc_1", "Note_1", "Task_In", [], { kind: "association" }),
        ];
        const adding = layoutOf([node("Task_A", box(100, 100)), sub, inside, note], edges);
        const result = layoutOf([node("Task_A", box(100, 150)), sub, inside, note]);

        const placedLayout = placeBesideNeighbours(result, [
            adding,
            layoutOf([node("Task_A", box(100, 150))]),
        ]);

        expect(boundsIn(placedLayout, "Note_1")).toEqual(box(300, 350, 100, 30));
        expect(boundsIn(placedLayout, "Task_In")).toEqual(box(300, 150));
    });

    it("leaves a shape inside a sub-process only its side draws where the sub-process takes it", () => {
        const sub = node("Sub_1", box(250, 60, 300, 160), { expanded: true });
        const inside = node("Task_In", box(300, 100), IN_SUB);
        const adding = layoutOf(
            [node("Task_A", box(100, 100)), sub, inside],
            [flow("Flow_AI", "Task_A", "Task_In")],
        );
        const other = layoutOf([node("Task_A", box(100, 150))]);
        const result = layoutOf([node("Task_A", box(100, 150)), sub, inside]);

        const placedLayout = placeBesideNeighbours(result, [adding, other]);

        expect(boundsIn(placedLayout, "Task_In")).toEqual(box(300, 100));
    });
});
