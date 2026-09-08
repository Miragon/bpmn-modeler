import { describe, expect, it } from "vitest";

import {
    BOUNDARY_EVENT,
    BROKEN_FLOW,
    COLLABORATION_TWO_POOLS,
    EXPANDED_SUB_PROCESS,
    GROUP_WITHOUT_MEMBERS,
    LINEAR_PROCESS,
    PARALLEL_GATEWAY,
    PROCESS_WITH_LANES,
    TEXT_ANNOTATION,
} from "../__fixtures__/diagrams";
import { LayoutEngineError } from "../port";
import type { LayoutResult } from "../types";
import { BpmnAutoLayoutEngine } from "./autoLayoutEngine";

const engine = new BpmnAutoLayoutEngine();

function ids(result: LayoutResult) {
    return {
        shapes: result.shapes.map((shape) => shape.id).sort(),
        edges: result.edges.map((edge) => edge.id).sort(),
    };
}

describe("BpmnAutoLayoutEngine", () => {
    it("returns geometry for every element of a linear process", async () => {
        const result = await engine.computeLayout(LINEAR_PROCESS);

        expect(ids(result)).toEqual({
            shapes: ["End_1", "Start_1", "Task_1"],
            edges: ["Flow_1", "Flow_2"],
        });
        expect(result.shapes.every((shape) => shape.width > 0 && shape.height > 0)).toBe(true);
        expect(result.edges.every((edge) => edge.waypoints.length >= 2)).toBe(true);
    });

    it("lays a linear process out left to right", async () => {
        const result = await engine.computeLayout(LINEAR_PROCESS);
        const byId = new Map(result.shapes.map((shape) => [shape.id, shape]));

        expect(byId.get("Start_1")!.x).toBeLessThan(byId.get("Task_1")!.x);
        expect(byId.get("Task_1")!.x).toBeLessThan(byId.get("End_1")!.x);
    });

    it("handles a gateway fan-out and join", async () => {
        const result = await engine.computeLayout(PARALLEL_GATEWAY);

        expect(ids(result).shapes).toEqual([
            "End_1",
            "Join_1",
            "Split_1",
            "Start_1",
            "Task_A",
            "Task_B",
        ]);
    });

    it("places a boundary event on its host", async () => {
        const result = await engine.computeLayout(BOUNDARY_EVENT);
        const byId = new Map(result.shapes.map((shape) => [shape.id, shape]));

        const host = byId.get("Task_1")!;
        const boundary = byId.get("Boundary_1")!;
        const centre = { x: boundary.x + boundary.width / 2, y: boundary.y + boundary.height / 2 };

        expect(centre.x).toBeGreaterThanOrEqual(host.x);
        expect(centre.x).toBeLessThanOrEqual(host.x + host.width);
        expect(centre.y).toBeGreaterThanOrEqual(host.y);
        expect(centre.y).toBeLessThanOrEqual(host.y + host.height);
    });

    it("reads geometry out of a subprocess plane as well as the root plane", async () => {
        const result = await engine.computeLayout(EXPANDED_SUB_PROCESS);

        expect(ids(result).shapes).toContain("SubProcess_1");
        expect(ids(result).shapes).toContain("Inner_Task");
    });

    // Capability assertions. These are the reason the feature can ship with
    // pools and lanes in scope at all: `latest` (1.3.0) lays out only the first
    // process and would leave every id below without geometry.
    it("lays out both pools of a collaboration and the message flow between them", async () => {
        const result = await engine.computeLayout(COLLABORATION_TWO_POOLS);
        const shapes = ids(result).shapes;

        expect(shapes).toContain("Participant_A");
        expect(shapes).toContain("Participant_B");
        expect(ids(result).edges).toContain("Message_1");
    });

    it("lays out lanes inside their participant", async () => {
        const result = await engine.computeLayout(PROCESS_WITH_LANES);
        const byId = new Map(result.shapes.map((shape) => [shape.id, shape]));

        const participant = byId.get("Participant_1")!;
        const laneA = byId.get("Lane_A")!;
        const laneB = byId.get("Lane_B")!;

        expect(laneA.x).toBeGreaterThanOrEqual(participant.x);
        expect(laneA.y).toBeGreaterThanOrEqual(participant.y);
        expect(laneB.y).toBeGreaterThan(laneA.y);
        expect(laneA.y + laneA.height + laneB.height).toBeLessThanOrEqual(
            participant.y + participant.height + 1,
        );
    });

    it("lays out a text annotation and its association", async () => {
        const result = await engine.computeLayout(TEXT_ANNOTATION);

        expect(ids(result).shapes).toContain("Annotation_1");
        expect(ids(result).edges).toContain("Association_1");
    });

    // The containment property, asserted: when the engine omits an element it
    // says so, and returns no geometry for it — so the applier emits no
    // operation and the element keeps the DI it already has. Observed in the
    // wild on a compensation association; reproduced here with a group.
    it("reports an omitted element as a diagnostic and returns no geometry for it", async () => {
        const result = await engine.computeLayout(GROUP_WITHOUT_MEMBERS);

        expect(ids(result).shapes).not.toContain("Group_1");
        expect(result.diagnostics).toContainEqual(
            expect.objectContaining({ elementId: "Group_1" }),
        );
    });

    it("wraps an engine refusal in a LayoutEngineError that names the element", async () => {
        await expect(engine.computeLayout(BROKEN_FLOW)).rejects.toThrow(LayoutEngineError);
        await expect(engine.computeLayout(BROKEN_FLOW)).rejects.toThrow(/Flow_1/);
    });

    it("wraps unparseable input rather than leaking the parser's error", async () => {
        await expect(engine.computeLayout("not xml at all")).rejects.toThrow(LayoutEngineError);
    });
});
