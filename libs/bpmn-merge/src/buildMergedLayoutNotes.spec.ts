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
import { layoutModelOf } from "./layoutModelReader";
import { detectLayoutSpots } from "./layoutSpotDetection";
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

/** The layout notes of the build that decides every open conflict for `side`, the other side where it cannot. */
async function layoutNotesOf(versions: MergeVersions, side: MergeSide = "current") {
    const decisions = MergeDecisions.from(await computeMerge(versions));
    while (decisions.openConflicts.length > 0) {
        const { id } = decisions.openConflicts[0]!;
        const applied =
            decisions.pick(id, side).applied || decisions.pick(id, otherSide(side)).applied;
        expect(applied, id).toBe(true);
    }
    const { notes } = await buildMerged(await prepareMergeSources(versions), decisions);
    return notes.filter(({ kind }) => LAYOUT_NOTE_KINDS.has(kind));
}

function flow(model: BpmnFixtureModel, id: string) {
    return model.flows.find((candidate) => candidate.id === id)!;
}

function task(id: string, x: number, y: number, lane: string) {
    return { id, type: "task" as const, x, y, lane };
}

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
                { kind: "flowEndOffShape", id: "Flow_6", ends: ["Task_R"] },
                { kind: "shapesOverlap", ids: ["Task_R", "Task_N"] },
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
            notes: [{ kind: "flowEndOffShape", id: "Flow_Retry", ends: ["Task_C"] }],
        },
        {
            name: "03 each side moved one end of a flow",
            versions: dockedVersions(
                "c7",
                (model) => dragNodes(model, ["Task_C", "End_Done"], 0, 30),
                (model) => dragNodes(model, ["Gateway_Ok"], 0, -40),
            ),
            notes: [{ kind: "flowEndOffShape", id: "Flow_Yes", ends: ["Gateway_Ok"] }],
        },
        {
            name: "04 both made the same room and inserted a task there",
            versions: dockedVersions(
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
            notes: [{ kind: "shapesOverlap", ids: ["Task_Y", "Task_X"] }],
        },
        {
            name: "05 both made room of different widths and inserted a task there",
            versions: dockedVersions(
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
            conflictsTo: "incoming",
            notes: [
                { kind: "flowEndOffShape", id: "Flow_Y", ends: ["Task_C"] },
                { kind: "shapesOverlap", ids: ["Task_Y", "Task_X"] },
                { kind: "flowThroughShape", id: "Flow_Yes", shapes: ["Task_X"] },
                { kind: "flowThroughShape", id: "Flow_X", shapes: ["Task_Y"] },
            ],
        },
        {
            name: "06 both inserted a task into one flow without making room",
            versions: dockedVersions(
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
            conflictsTo: "incoming",
            notes: [
                { kind: "shapesOverlap", ids: ["Task_Y", "Task_X"] },
                { kind: "flowThroughShape", id: "Flow_Yes", shapes: ["Task_X"] },
                { kind: "flowThroughShape", id: "Flow_Y", shapes: ["Task_X"] },
                { kind: "flowThroughShape", id: "Flow_X", shapes: ["Task_Y"] },
            ],
        },
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
            notes: [{ kind: "flowEndOffShape", id: "Flow_4", ends: ["End_Done"] }],
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
            notes: [{ kind: "flowThroughShape", id: "Flow_No", shapes: ["Task_Log"] }],
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
            notes: [{ kind: "lanesOverlap", ids: ["Lane_Sales", "Lane_Back"] }],
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
                    containers: ["Participant_Order", "Lane_Back"],
                },
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
            notes: [{ kind: "flowEndOffShape", id: "Flow_Yes", ends: ["Task_C"] } as const],
        })),
    ])("$name", async ({ versions, conflictsTo, notes }) => {
        expect(await layoutNotesOf(versions, conflictsTo)).toEqual(notes);
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
