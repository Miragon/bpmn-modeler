import { describe, expect, it } from "vitest";

import { cloneModel, nodeById } from "./__fixtures__/baseModel";
import { type BpmnFixtureModel, renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { dock, dockedModel, moveNode } from "./__fixtures__/dockedModel";
import { parseWithoutWarnings } from "./__fixtures__/parseWithoutWarnings";
import type { LayoutModel } from "./layoutModel";
import { layoutModelOf } from "./layoutModelReader";
import { detectLayoutSpots, introducedLayoutSpots } from "./layoutSpotDetection";

async function layoutOf(model: BpmnFixtureModel): Promise<LayoutModel> {
    return layoutModelOf((await parseWithoutWarnings(renderBpmn(model))).rootElement);
}

async function spotsOf(edit: (model: BpmnFixtureModel) => void) {
    const model = dockedModel("c8");
    edit(model);
    return detectLayoutSpots(await layoutOf(model));
}

function addTask(model: BpmnFixtureModel, id: string, x: number, y: number, lane = "Lane_Back") {
    model.nodes.push({ id, type: "task", x, y, lane });
}

function withShipSubProcess(model: BpmnFixtureModel): void {
    model.nodes.push(
        {
            id: "Sub_Pack",
            type: "subProcess",
            x: 820,
            y: 70,
            width: 280,
            height: 140,
            lane: "Lane_Sales",
        },
        { id: "Task_Pack", type: "task", x: 860, y: 100, parent: "Sub_Pack" },
    );
}

describe("detectLayoutSpots", () => {
    it("finds nothing in a diagram drawn as bpmn-js draws it", async () => {
        expect(await spotsOf(() => undefined)).toEqual([]);
    });

    describe("flow ends", () => {
        it("names the end of a flow whose shape moved away", async () => {
            const spots = await spotsOf((model) => moveNode(model, "Task_C", 60));

            expect(spots).toEqual([
                { kind: "flowEndOffShape", flow: "Flow_Yes", end: "Task_C", at: "target" },
            ]);
        });

        it("names each end of a flow that lies off its shape's outline", async () => {
            const spots = await spotsOf((model) => {
                model.flows.find(({ id }) => id === "Flow_4")!.waypoints = [
                    [670, 140],
                    [730, 140],
                ];
            });

            expect(spots).toEqual([
                { kind: "flowEndOffShape", flow: "Flow_4", end: "Task_C", at: "source" },
                { kind: "flowEndOffShape", flow: "Flow_4", end: "End_Done", at: "target" },
            ]);
        });

        it("measures an event by its circle and a gateway by its diamond", async () => {
            const spots = await spotsOf((model) => {
                model.flows.find(({ id }) => id === "Flow_1")!.waypoints = [
                    [216, 124],
                    [260, 124],
                ];
                model.flows.find(({ id }) => id === "Flow_2")!.waypoints = [
                    [360, 120],
                    [420, 120],
                ];
            });

            expect(spots).toEqual([
                { kind: "flowEndOffShape", flow: "Flow_1", end: "Start_Order", at: "source" },
                { kind: "flowEndOffShape", flow: "Flow_2", end: "Gateway_Ok", at: "target" },
            ]);
        });

        it("accepts an end a few pixels off and an end inside its shape", async () => {
            const spots = await spotsOf((model) => {
                model.flows.find(({ id }) => id === "Flow_1")!.waypoints = [
                    [220, 140],
                    [300, 140],
                ];
            });

            expect(spots).toEqual([]);
        });
    });

    describe("overlapping shapes", () => {
        it("names two shapes that lie on top of each other", async () => {
            const spots = await spotsOf((model) => addTask(model, "Task_N", 540, 280));

            expect(spots).toContainEqual({ kind: "shapesOverlap", shapes: ["Task_R", "Task_N"] });
        });

        it("ignores shapes that only touch", async () => {
            const spots = await spotsOf((model) => addTask(model, "Task_N", 622, 260));

            expect(spots.filter(({ kind }) => kind === "shapesOverlap")).toEqual([]);
        });

        it("ignores a shape on its own sub-process and a boundary event on its host", async () => {
            const spots = await spotsOf((model) => {
                withShipSubProcess(model);
                model.nodes.push({
                    id: "Boundary_Late",
                    type: "boundaryEvent",
                    x: 292,
                    y: 162,
                    attachedTo: "Task_A",
                    lane: "Lane_Sales",
                    eventDefinition: { kind: "timer", id: "Timer_Late", duration: "P1D" },
                });
            });

            expect(spots.filter(({ kind }) => kind === "shapesOverlap")).toEqual([]);
        });

        it("names a shape lying on a sub-process it is not part of", async () => {
            const spots = await spotsOf((model) => {
                withShipSubProcess(model);
                addTask(model, "Task_Stray", 980, 100, "Lane_Sales");
            });

            expect(spots).toContainEqual({
                kind: "shapesOverlap",
                shapes: ["Sub_Pack", "Task_Stray"],
            });
        });
    });

    describe("flows through shapes", () => {
        it("names a flow whose segment crosses a shape that is not its end", async () => {
            const spots = await spotsOf((model) => addTask(model, "Task_N", 700, 260));

            expect(spots).toEqual([{ kind: "flowThroughShape", flow: "Flow_6", shape: "Task_N" }]);
        });

        it("ignores a flow running along a shape's outline", async () => {
            const spots = await spotsOf((model) => addTask(model, "Task_N", 700, 300));

            expect(spots).toEqual([]);
        });

        it("ignores the sub-process holding a flow's end and a boundary event's host", async () => {
            const spots = await spotsOf((model) => {
                withShipSubProcess(model);
                model.nodes.push({
                    id: "Boundary_Late",
                    type: "boundaryEvent",
                    x: 552,
                    y: 322,
                    attachedTo: "Task_R",
                    lane: "Lane_Back",
                    eventDefinition: { kind: "timer", id: "Timer_Late", duration: "P1D" },
                });
                model.flows.push(
                    {
                        id: "Flow_Pack",
                        source: "Task_R",
                        target: "Task_Pack",
                        waypoints: [
                            [570, 260],
                            [570, 240],
                            [910, 240],
                            [910, 180],
                        ],
                    },
                    {
                        id: "Flow_Late",
                        source: "Boundary_Late",
                        target: "Task_C",
                        waypoints: [
                            [570, 322],
                            [570, 180],
                        ],
                    },
                );
                model.flows.find(({ id }) => id === "Flow_6")!.waypoints = [
                    [620, 280],
                    [700, 280],
                    [700, 90],
                    [1080, 90],
                    [1080, 300],
                    [928, 300],
                ];
            });

            expect(spots).toEqual([
                { kind: "flowThroughShape", flow: "Flow_6", shape: "Sub_Pack" },
            ]);
        });
    });

    describe("containers", () => {
        it("names a shape outside its lane and its pool", async () => {
            const spots = await spotsOf((model) => {
                moveNode(model, "End_Rejected", 0, 100);
                dock(model, ["End_Rejected"]);
            });

            expect(spots).toEqual([
                {
                    kind: "shapeOutsideContainer",
                    shape: "End_Rejected",
                    container: "Participant_Order",
                },
                { kind: "shapeOutsideContainer", shape: "End_Rejected", container: "Lane_Back" },
            ]);
        });

        it("names a shape outside its expanded sub-process", async () => {
            const spots = await spotsOf((model) => {
                withShipSubProcess(model);
                nodeById(model, "Task_Pack").x = 1060;
            });

            expect(spots).toContainEqual({
                kind: "shapeOutsideContainer",
                shape: "Task_Pack",
                container: "Sub_Pack",
            });
        });

        it("names a sub-process outside its lane, not the contents that move with it", async () => {
            const spots = await spotsOf((model) => {
                withShipSubProcess(model);
                nodeById(model, "Sub_Pack").y = 160;
                nodeById(model, "Task_Pack").y = 190;
            });

            expect(spots.filter(({ kind }) => kind === "shapeOutsideContainer")).toEqual([
                { kind: "shapeOutsideContainer", shape: "Sub_Pack", container: "Lane_Sales" },
            ]);
        });

        it("lets a boundary event straddle its host's lane and a data store lie outside the pool", async () => {
            const spots = await spotsOf((model) => {
                model.nodes.push(
                    {
                        id: "Boundary_Late",
                        type: "boundaryEvent",
                        x: 552,
                        y: 362,
                        attachedTo: "Task_R",
                        lane: "Lane_Back",
                        eventDefinition: { kind: "timer", id: "Timer_Late", duration: "P1D" },
                    },
                    {
                        id: "Store_Orders",
                        type: "dataStoreReference",
                        x: 400,
                        y: 420,
                        lane: "Lane_Back",
                    },
                );
                nodeById(model, "Task_R").y = 300;
                dock(model, ["Task_R"]);
            });

            expect(spots.filter(({ kind }) => kind === "shapeOutsideContainer")).toEqual([]);
        });
    });

    describe("boundary events", () => {
        it("names a boundary event that is not on its host's border", async () => {
            const spots = await spotsOf((model) => {
                model.nodes.push({
                    id: "Boundary_Late",
                    type: "boundaryEvent",
                    x: 292,
                    y: 202,
                    attachedTo: "Task_A",
                    lane: "Lane_Sales",
                    eventDefinition: { kind: "timer", id: "Timer_Late", duration: "P1D" },
                });
            });

            expect(spots).toEqual([
                { kind: "boundaryEventOffHost", boundaryEvent: "Boundary_Late", host: "Task_A" },
            ]);
        });
    });

    describe("lanes", () => {
        it("names two lanes of one pool that overlap", async () => {
            const spots = await spotsOf((model) => {
                model.lanes[0]!.height = 240;
            });

            expect(spots).toEqual([{ kind: "lanesOverlap", lanes: ["Lane_Sales", "Lane_Back"] }]);
        });
    });

    it("looks at each plane on its own", async () => {
        const spots = await spotsOf((model) => {
            withShipSubProcess(model);
            Object.assign(nodeById(model, "Sub_Pack"), {
                collapsed: true,
                x: 1000,
                y: 100,
                width: 100,
                height: 80,
            });
            addTask(model, "Task_Under", 870, 110, "Lane_Sales");
        });

        expect(spots).toEqual([]);
    });
});

describe("introducedLayoutSpots", () => {
    it("drops a spot a side drew itself", async () => {
        const drawn = dockedModel("c8");
        moveNode(drawn, "Task_C", 60);
        const layout = await layoutOf(drawn);

        expect(introducedLayoutSpots(layout, [await layoutOf(dockedModel("c8")), layout])).toEqual(
            [],
        );
    });

    it("keeps a spot whose shapes a side drew but whose relation it did not hold", async () => {
        const lanesSwapped = dockedModel("c8");
        nodeById(lanesSwapped, "Task_R").lane = "Lane_Sales";
        const ownLane = dockedModel("c8");
        const result = await layoutOf(lanesSwapped);

        expect(introducedLayoutSpots(result, [await layoutOf(ownLane), result])).toEqual([]);
        expect(introducedLayoutSpots(result, [await layoutOf(ownLane)])).toEqual([
            { kind: "shapeOutsideContainer", shape: "Task_R", container: "Lane_Sales" },
        ]);
    });

    it.each([
        ["a flow's end", (model: BpmnFixtureModel) => moveNode(model, "Task_C", 60)],
        ["an overlap", (model: BpmnFixtureModel) => addTask(model, "Task_N", 540, 280)],
        ["a flow through a shape", (model: BpmnFixtureModel) => addTask(model, "Task_N", 700, 260)],
        [
            "a shape outside its frame",
            (model: BpmnFixtureModel) => moveNode(model, "End_Rejected", 0, 100),
        ],
        [
            "a boundary event off its host",
            (model: BpmnFixtureModel) =>
                model.nodes.push({
                    id: "Boundary_Late",
                    type: "boundaryEvent",
                    x: 292,
                    y: 202,
                    attachedTo: "Task_A",
                    lane: "Lane_Sales",
                }),
        ],
        [
            "overlapping lanes",
            (model: BpmnFixtureModel) => {
                model.lanes[0]!.height = 240;
            },
        ],
    ])("drops %s that a side drew alike", async (_kind, edit) => {
        const drawn = dockedModel("c8");
        edit(drawn);
        const sideLayout = await layoutOf(drawn);
        const result = await layoutOf(cloneModel(drawn));

        expect(detectLayoutSpots(result)).not.toEqual([]);
        expect(introducedLayoutSpots(result, [sideLayout])).toEqual([]);
    });
});
