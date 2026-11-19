import { describe, expect, it } from "vitest";

import { baseModel, cloneModel, nodeById } from "./__fixtures__/baseModel";
import { type BpmnFixtureModel, renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import {
    dock,
    dockedVersions,
    dragNodes,
    insertIntoFlow,
    moveNode,
} from "./__fixtures__/dockedModel";
import { MERGE_SCENARIOS } from "./__fixtures__/mergeScenarios";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import { type BuildNote, buildMerged } from "./buildMerged";
import { prepareMergeSources } from "./buildMergedSources";
import { computeMerge, type MergeVersions } from "./computeMerge";
import {
    bottomOf,
    centerOf,
    inflated,
    keepsClearOf,
    liesWithin,
    segmentEntersBounds,
} from "./layoutGeometry";
import { layoutModelOf } from "./layoutModelReader";
import { distanceToPolyline, segmentsOf } from "./layoutPolyline";
import { ROOM_GAP, STACK_GAP } from "./layoutRoomPush";
import { SHAPE_CLEARANCE } from "./layoutShapePlacement";
import { detectLayoutSpots, introducedLayoutSpots } from "./layoutSpotDetection";
import type { LayoutSpot } from "./layoutSpots";
import { MergeDecisions } from "./mergeDecisions";
import { type MergeSide, otherSide } from "./mergeResult";

const LAYOUT_NOTE_KINDS: ReadonlySet<BuildNote["kind"]> = new Set([
    "flowEndOffShape",
    "shapesOverlap",
    "flowThroughShape",
    "shapeOutsideContainer",
    "boundaryEventOffHost",
    "lanesOverlap",
]);

/** The build that decides every open conflict for `side`, the other side where it cannot. */
async function builtOf(versions: MergeVersions, side: MergeSide = "current") {
    const decisions = MergeDecisions.from(await computeMerge(versions));
    while (decisions.openConflicts.length > 0) {
        const { id } = decisions.openConflicts[0]!;
        const applied =
            decisions.pick(id, side).applied || decisions.pick(id, otherSide(side)).applied;
        expect(applied, id).toBe(true);
    }
    return buildMerged(await prepareMergeSources(versions), decisions);
}

async function layoutNotesOf(versions: MergeVersions, side: MergeSide = "current") {
    const { notes } = await builtOf(versions, side);
    return notes.filter(({ kind }) => LAYOUT_NOTE_KINDS.has(kind));
}

async function layoutOfXml(xml: string) {
    return layoutModelOf((await parseWithoutWarnings(xml)).rootElement);
}

/** The spots the written result has that neither side drew, read after the repair. */
async function spotsLeftIn(xml: string, versions: MergeVersions): Promise<LayoutSpot[]> {
    const sides = await Promise.all([versions.current, versions.incoming].map(layoutOfXml));
    return introducedLayoutSpots(await layoutOfXml(xml), sides);
}

/** Whether a note still names the spot by its ids, as one the build could not repair. */
function namedByNote(spot: LayoutSpot, notes: readonly BuildNote[]): boolean {
    return notes.some((note) => {
        if (note.kind !== spot.kind) return false;
        switch (note.kind) {
            case "flowEndOffShape":
            case "flowThroughShape":
                return "flow" in spot && note.id === spot.flow && note.repair === "notRepaired";
            case "shapesOverlap":
                return (
                    spot.kind === "shapesOverlap" &&
                    sameIds(note.ids, spot.shapes) &&
                    note.repair === "notRepaired"
                );
            case "shapeOutsideContainer":
                return (
                    spot.kind === "shapeOutsideContainer" &&
                    note.id === spot.shape &&
                    note.shapes.includes(spot.container) &&
                    note.repair === "notRepaired"
                );
            case "boundaryEventOffHost":
                return spot.kind === "boundaryEventOffHost" && note.id === spot.boundaryEvent;
            case "lanesOverlap":
                return (
                    spot.kind === "lanesOverlap" &&
                    sameIds(note.ids, spot.lanes) &&
                    note.repair === "notRepaired"
                );
            default:
                return false;
        }
    });
}

function sameIds(first: readonly string[], second: readonly string[]): boolean {
    return first.length === second.length && first.every((id) => second.includes(id));
}

function moved(
    kind: "flowEndOffShape" | "flowThroughShape",
    id: string,
    ...shapes: string[]
): BuildNote {
    return { kind, id, shapes, repair: "movedByBuild" };
}

function movedOff(ids: [string, string], shape: string): BuildNote {
    return { kind: "shapesOverlap", ids, repair: "movedByBuild", moved: shape };
}

/**
 * No free place lies near the inserted tasks, which are parallel branches into Ship: one is
 * stacked under the other, its lane grows and the lane below shifts down with what it holds.
 */
function stacked(ids: [string, string], shape: string, shifted: string[] = []): BuildNote {
    return {
        kind: "shapesOverlap",
        ids,
        repair: "madeRoom",
        moved: shape,
        shifted: [...shifted, "Task_R", "End_Rejected"],
        grown: ["Participant_Order", "Lane_Sales"],
    };
}

function flow(model: BpmnFixtureModel, id: string) {
    return model.flows.find((candidate) => candidate.id === id)!;
}

function task(id: string, x: number, y: number, lane: string) {
    return { id, type: "task" as const, x, y, lane };
}

/** Both sides inserted a task between the gateway and Ship: in the same room, in room of different widths, or without room. */
const BOTH_INSERTED = {
    SAME_ROOM: dockedVersions(
        "c8",
        (model) => {
            dragNodes(model, ["Task_C", "End_Done"], 150);
            insertIntoFlow(
                model,
                "Flow_Yes",
                task("Task_X", 530, 100, "Lane_Sales"),
                "Flow_X",
            );
        },
        (model) => {
            dragNodes(model, ["Task_C", "End_Done"], 150);
            insertIntoFlow(
                model,
                "Flow_Yes",
                task("Task_Y", 530, 100, "Lane_Sales"),
                "Flow_Y",
            );
        },
    ),
    DIFFERENT_ROOM: dockedVersions(
        "c7",
        (model) => {
            dragNodes(model, ["Task_C", "End_Done"], 140);
            insertIntoFlow(
                model,
                "Flow_Yes",
                task("Task_X", 520, 100, "Lane_Sales"),
                "Flow_X",
            );
        },
        (model) => {
            dragNodes(model, ["Task_C", "End_Done"], 170);
            insertIntoFlow(
                model,
                "Flow_Yes",
                task("Task_Y", 540, 100, "Lane_Sales"),
                "Flow_Y",
            );
        },
    ),
    NO_ROOM: dockedVersions(
        "c8",
        (model) =>
            insertIntoFlow(
                model,
                "Flow_Yes",
                task("Task_X", 470, 100, "Lane_Sales"),
                "Flow_X",
            ),
        (model) =>
            insertIntoFlow(
                model,
                "Flow_Yes",
                task("Task_Y", 480, 100, "Lane_Sales"),
                "Flow_Y",
            ),
    ),
};

describe("buildMerged's layout notes", () => {
    it.each<{
        name: string;
        versions: MergeVersions;
        conflictsTo?: MergeSide;
        notes: BuildNote[];
    }>([
        {
            name: "01 a task moved onto one the other side added: hidden, its flow ends in the open",
            versions: dockedVersions(
                "c8",
                (model) => dragNodes(model, ["Task_R"], 150),
                (model) =>
                    insertIntoFlow(
                        model,
                        "Flow_6",
                        task("Task_N", 670, 260, "Lane_Back"),
                        "Flow_7",
                    ),
            ),
            notes: [
                movedOff(["Task_R", "Task_N"], "Task_R"),
                moved("flowEndOffShape", "Flow_No", "Task_R"),
            ],
        },
        {
            name: "02 a task moved away from the other side's new flow into it",
            versions: dockedVersions(
                "c7",
                (model) => dragNodes(model, ["Task_C", "End_Done"], 140),
                (model) => {
                    model.flows.push({
                        id: "Flow_Retry",
                        source: "Task_R",
                        target: "Task_C",
                        waypoints: [
                            [610, 260],
                            [610, 180],
                        ],
                    });
                },
            ),
            notes: [moved("flowEndOffShape", "Flow_Retry", "Task_C")],
        },
        {
            name: "03 each side moved one end of a flow",
            versions: dockedVersions(
                "c7",
                (model) => dragNodes(model, ["Task_C", "End_Done"], 0, 30),
                (model) => dragNodes(model, ["Gateway_Ok"], 0, -40),
            ),
            notes: [moved("flowEndOffShape", "Flow_Yes", "Gateway_Ok")],
        },
        {
            name: "04 both made the same room and inserted a task there",
            versions: BOTH_INSERTED.SAME_ROOM,
            notes: [
                stacked(["Task_Y", "Task_X"], "Task_Y"),
                moved("flowEndOffShape", "Flow_Y", "Task_Y"),
            ],
        },
        {
            name: "05 both made room of different widths and inserted a task there",
            versions: BOTH_INSERTED.DIFFERENT_ROOM,
            conflictsTo: "incoming",
            notes: [
                moved("flowEndOffShape", "Flow_Y", "Task_C"),
                stacked(["Task_Y", "Task_X"], "Task_X"),
                moved("flowThroughShape", "Flow_X", "Task_Y"),
                moved("flowEndOffShape", "Flow_X", "Task_X"),
            ],
        },
        ...(
            [
                {
                    conflictsTo: "incoming",
                    notes: [
                        stacked(["Task_Y", "Task_X"], "Task_X", ["Task_C", "End_Done"]),
                        moved("flowThroughShape", "Flow_X", "Task_Y"),
                        moved("flowEndOffShape", "Flow_X", "Task_X", "Task_C"),
                    ],
                },
                {
                    conflictsTo: "current",
                    notes: [
                        stacked(["Task_Y", "Task_X"], "Task_Y", ["Task_C", "End_Done"]),
                        moved("flowThroughShape", "Flow_Y", "Task_X"),
                        moved("flowEndOffShape", "Flow_Y", "Task_Y", "Task_C"),
                    ],
                },
            ] as const
        ).map(({ conflictsTo, notes }) => ({
            name: `06 both inserted a task into one flow without making room, its conflicts decided for ${conflictsTo}`,
            versions: BOTH_INSERTED.NO_ROOM,
            conflictsTo,
            notes: [...notes],
        })),
        {
            name: "07 a flow kept against its removal while the remover moved its end",
            versions: dockedVersions(
                "c8",
                (model) => {
                    flow(model, "Flow_4").condition = "${shipped}";
                },
                (model) => {
                    model.flows = model.flows.filter(({ id }) => id !== "Flow_4");
                    moveNode(model, "End_Done", 60, 50);
                },
            ),
            notes: [moved("flowEndOffShape", "Flow_4", "End_Done")],
        },
        {
            name: "08 a flow re-routed through a task the other side added",
            versions: dockedVersions(
                "c8",
                (model) => {
                    flow(model, "Flow_No").waypoints = [
                        [440, 165],
                        [440, 240],
                        [570, 240],
                        [570, 260],
                    ];
                },
                (model) => {
                    model.nodes.push({
                        ...task("Task_Log", 450, 225, "Lane_Back"),
                        width: 80,
                        height: 30,
                    });
                },
            ),
            notes: [moved("flowThroughShape", "Flow_No", "Task_Log")],
        },
        {
            name: "09 a boundary event added on a host the other side moved",
            versions: dockedVersions(
                "c7",
                (model) => dragNodes(model, ["Task_A"], 0, 40),
                (model) => {
                    model.nodes.push({
                        id: "Boundary_Late",
                        type: "boundaryEvent",
                        x: 292,
                        y: 162,
                        attachedTo: "Task_A",
                        interrupting: false,
                        lane: "Lane_Sales",
                        eventDefinition: { kind: "timer", id: "Timer_Late", duration: "P1D" },
                    });
                    model.flows.push({
                        id: "Flow_Late",
                        source: "Boundary_Late",
                        target: "Task_R",
                    });
                    dock(model, ["Boundary_Late"]);
                },
            ),
            notes: [{ kind: "boundaryEventOffHost", id: "Boundary_Late", host: "Task_A" }],
        },
        {
            name: "10 a lane kept against its removal, the other lane grown over it",
            versions: dockedVersions(
                "c7",
                (model) => {
                    model.lanes[1]!.name = "Returns";
                },
                (model) => {
                    model.lanes = [{ ...model.lanes[0]!, height: 320 }];
                    for (const node of model.nodes) node.lane = "Lane_Sales";
                },
            ),
            notes: [
                {
                    kind: "lanesOverlap",
                    ids: ["Lane_Back", "Lane_Sales"],
                    repair: "movedByBuild",
                    moved: "Lane_Back",
                    grown: ["Participant_Order"],
                    shifted: [],
                },
            ],
        },
        {
            name: "11 a task added in room the other side took away",
            versions: dockedVersions(
                "c7",
                (model) => {
                    model.pools[0]!.width = 900;
                    for (const lane of model.lanes) lane.width = 870;
                    dragNodes(model, ["End_Rejected"], -100);
                },
                (model) => {
                    model.pools[0]!.width = 1200;
                    for (const lane of model.lanes) lane.width = 1170;
                    model.nodes.push(task("Task_Archive", 990, 260, "Lane_Back"));
                    model.flows.push({
                        id: "Flow_Archive",
                        source: "Task_R",
                        target: "Task_Archive",
                        waypoints: [
                            [570, 340],
                            [570, 360],
                            [1040, 360],
                            [1040, 340],
                        ],
                    });
                },
            ),
            notes: [
                {
                    kind: "shapeOutsideContainer",
                    id: "Task_Archive",
                    shapes: ["Participant_Order", "Lane_Back"],
                    repair: "movedIntoContainer",
                },
                moved("flowEndOffShape", "Flow_Archive", "Task_Archive"),
            ],
        },
        ...(["current", "incoming"] as const).map((conflictsTo) => ({
            name: `12 a flow's end moved onto the flow, its conflicts decided for ${conflictsTo}`,
            versions: dockedVersions(
                "c8",
                (model) => dragNodes(model, ["Gateway_Ok"], -20),
                (model) => dragNodes(model, ["Task_C"], -50),
            ),
            conflictsTo,
            notes: [moved("flowEndOffShape", "Flow_Yes", "Task_C")],
        })),
    ])("$name", async ({ versions, conflictsTo, notes }) => {
        const built = await builtOf(versions, conflictsTo);

        expect(built.notes.filter(({ kind }) => LAYOUT_NOTE_KINDS.has(kind))).toEqual(notes);
        for (const spot of await spotsLeftIn(built.xml, versions)) {
            expect(namedByNote(spot, built.notes), JSON.stringify(spot)).toBe(true);
        }
    });

    it.each(
        (["SAME_ROOM", "DIFFERENT_ROOM", "NO_ROOM"] as const).flatMap((fixture) =>
            (["current", "incoming"] as const).map((conflictsTo) => ({ fixture, conflictsTo })),
        ),
    )(
        "$fixture, conflicts to $conflictsTo: stacks the moved task under the other with no flow routed around it",
        async ({ fixture, conflictsTo }) => {
            const versions = BOTH_INSERTED[fixture];

            const { xml, notes } = await builtOf(versions, conflictsTo);

            const room = notes.find((note) => note.kind === "shapesOverlap");
            expect(room).toMatchObject({ repair: "madeRoom" });
            const movedId = room?.kind === "shapesOverlap" && "moved" in room ? room.moved : "";
            const otherId = movedId === "Task_X" ? "Task_Y" : "Task_X";
            const layout = await layoutOfXml(xml);
            const [movedTask, other, ship, shipped] = [movedId, otherId, "Task_C", "End_Done"].map(
                (id) => layout.shapes.get(id)!.bounds,
            );
            expect(movedTask!.y).toBeGreaterThanOrEqual(bottomOf(other!) + STACK_GAP);
            expect(movedTask!.x).toBeLessThan(other!.x + other!.width);
            expect(other!.x).toBeLessThan(movedTask!.x + movedTask!.width);
            expect(
                notes.filter(
                    (note) => note.kind === "flowThroughShape" && note.shapes.includes(movedId),
                ),
            ).toEqual([]);
            for (const edge of layout.edges.values()) {
                if (edge.source !== movedId && edge.target !== movedId) continue;
                expect(edge.waypoints.length, edge.id).toBeLessThanOrEqual(3);
            }
            expect(shipped!.x - (ship!.x + ship!.width)).toBeGreaterThanOrEqual(ROOM_GAP);
            for (const edge of layout.edges.values()) {
                if (edge.source === movedId || edge.target === movedId) continue;
                const clear = inflated(movedTask!, SHAPE_CLEARANCE);
                for (const [from, to] of segmentsOf(edge.waypoints)) {
                    expect(segmentEntersBounds(from, to, clear), edge.id).toBe(false);
                }
                if (edge.label !== undefined) {
                    expect(keepsClearOf(movedTask!, edge.label, SHAPE_CLEARANCE), edge.id).toBe(true);
                }
            }
        },
    );

    it("moves a flow's label with the flow it re-routes", async () => {
        const labelled = (model: BpmnFixtureModel) => {
            flow(model, "Flow_Yes").label = { x: 470, y: 120, width: 20, height: 14 };
        };
        const versions = dockedVersions(
            "c7",
            (model) => {
                dragNodes(model, ["Task_C", "End_Done"], 0, 30);
                labelled(model);
            },
            (model) => {
                dragNodes(model, ["Gateway_Ok"], 0, -40);
                labelled(model);
            },
        );
        const sideFlow = (await layoutOfXml(versions.current)).edges.get("Flow_Yes")!;

        const { xml } = await builtOf(versions);
        const builtFlow = (await layoutOfXml(xml)).edges.get("Flow_Yes")!;

        expect(builtFlow.waypoints).not.toEqual(sideFlow.waypoints);
        expect(builtFlow.label).not.toEqual(sideFlow.label);
        expect(distanceToPolyline(builtFlow.waypoints, centerOf(builtFlow.label!))).toBeCloseTo(
            distanceToPolyline(sideFlow.waypoints, centerOf(sideFlow.label!)),
            0,
        );
    });

    describe("a pool's lanes", () => {
        const boundsOf = async (xml: string, ids: readonly string[]) => {
            const layout = await layoutOfXml(xml);
            return ids.map((id) => layout.shapes.get(id)?.bounds);
        };
        const POOL_AND_LANES = ["Participant_Order", "Lane_Sales", "Lane_Back"];
        const growBackOffice = (model: BpmnFixtureModel) => {
            model.lanes[1]!.height = 200;
            model.pools[0]!.height = 360;
        };
        const growSales = (model: BpmnFixtureModel) => {
            model.lanes[0]!.height = 200;
            model.lanes[1]!.y = 260;
            model.pools[0]!.height = 360;
            dragNodes(model, ["Task_R", "End_Rejected"], 0, 40);
        };
        const shrinkBackOffice = (model: BpmnFixtureModel) => {
            model.lanes[1]!.height = 120;
            model.pools[0]!.height = 280;
        };
        const renameCheck = (model: BpmnFixtureModel) => {
            nodeById(model, "Task_A").name = "Check the order";
        };

        it.each([
            { side: "current", versions: dockedVersions("c7", growBackOffice, renameCheck) },
            { side: "incoming", versions: dockedVersions("c7", renameCheck, growBackOffice) },
        ] as const)(
            "draws a pool whose lanes only $side changed exactly as $side drew it",
            async ({ side, versions }) => {
                const { xml } = await builtOf(versions);

                expect(await boundsOf(xml, POOL_AND_LANES)).toEqual(
                    await boundsOf(versions[side], POOL_AND_LANES),
                );
            },
        );

        it("draws every lane from current when both sides changed lanes", async () => {
            const versions = dockedVersions("c7", shrinkBackOffice, growSales);

            const { xml, notes } = await builtOf(versions);

            expect(await boundsOf(xml, POOL_AND_LANES)).toEqual(
                await boundsOf(versions.current, POOL_AND_LANES),
            );
            expect(notes.filter(({ kind }) => kind === "lanesOverlap")).toEqual([]);
        });

        const addLaneBelow = (model: BpmnFixtureModel) => {
            model.lanes.push({
                id: "Lane_New",
                name: "New",
                x: 150,
                y: 380,
                width: 970,
                height: 120,
            });
            model.pools[0]!.height = 440;
            model.nodes.push({
                id: "Task_N",
                type: "task",
                name: "New",
                x: 300,
                y: 400,
                lane: "Lane_New",
            });
        };
        const widenPool = (model: BpmnFixtureModel) => {
            model.pools[0]!.width = 1200;
            for (const lane of model.lanes) lane.width = 1170;
        };

        it.each([
            { change: "moves a lane divider", edit: shrinkBackOffice, stackedAt: 340 },
            { change: "widens the pool and its lanes", edit: widenPool, stackedAt: 380 },
        ])(
            "stacks a lane the other side adds at the bottom when this side $change, and names it",
            async ({ edit, stackedAt }) => {
                const versions = dockedVersions("c7", edit, addLaneBelow);

                const { xml, notes } = await builtOf(versions);

                const layout = await layoutOfXml(xml);
                const [pool, back, added, task] = [
                    "Participant_Order",
                    "Lane_Back",
                    "Lane_New",
                    "Task_N",
                ].map((id) => layout.shapes.get(id)!.bounds);
                expect(added).toEqual({
                    x: back!.x,
                    y: stackedAt,
                    width: back!.width,
                    height: 120,
                });
                expect(bottomOf(pool!)).toBe(stackedAt + 120);
                expect(liesWithin(task!, added!)).toBe(true);
                expect(notes).toContainEqual({
                    kind: "lanesOverlap",
                    ids: ["Lane_New"],
                    repair: "movedByBuild",
                    moved: "Lane_New",
                    grown: ["Participant_Order"],
                    shifted: [],
                });
                for (const spot of await spotsLeftIn(xml, versions)) {
                    expect(namedByNote(spot, notes), JSON.stringify(spot)).toBe(true);
                }
            },
        );

        it.each(["current", "incoming"] as const)(
            "rule: lane, conflicts to %s: no lanes overlap and each lane holds its members, unless a note names one",
            async (side) => {
                const scenario = MERGE_SCENARIOS.find(({ name }) => name === "rule: lane")!;

                const { xml, notes } = await builtOf(scenario, side);

                const spots = detectLayoutSpots(await layoutOfXml(xml));
                expect(spots.filter(({ kind }) => kind === "lanesOverlap")).toEqual([]);
                const lanesNotHolding = spots.filter(
                    (spot) =>
                        spot.kind === "shapeOutsideContainer" && spot.container.startsWith("Lane"),
                );
                for (const spot of lanesNotHolding) {
                    expect(namedByNote(spot, notes), JSON.stringify(spot)).toBe(true);
                }
            },
        );
    });

    describe("only spots neither side drew", () => {
        it("names no flow through a shape both sides inherited from the base", async () => {
            const base = baseModel("c7");
            const versions = {
                base: renderBpmn(base),
                current: renderBpmn(base),
                incoming: renderBpmn(base),
            };

            expect(await layoutNotesOf(versions)).toEqual([]);
        });

        it("names no spot one side drew itself and the result keeps from it", async () => {
            const base = baseModel("c7");
            const current = cloneModel(base);
            nodeById(current, "Task_Reject").x = 732;
            const incoming = cloneModel(base);
            nodeById(incoming, "Task_Check").name = "Check the order";
            const currentXml = renderBpmn(current);

            expect(
                detectLayoutSpots(
                    layoutModelOf((await parseWithoutWarnings(currentXml)).rootElement),
                ),
            ).toContainEqual({ kind: "shapesOverlap", shapes: ["Task_Reject", "End_Rejected"] });
            expect(
                await layoutNotesOf({
                    base: renderBpmn(base),
                    current: currentXml,
                    incoming: renderBpmn(incoming),
                }),
            ).toEqual([]);
        });

        it.each(MERGE_SCENARIOS.filter(({ name }) => name.startsWith("independent")))(
            "$name: notes no spot on changes that do not meet",
            async (scenario) => {
                expect(await layoutNotesOf(scenario)).toEqual([]);
            },
        );
    });
});
