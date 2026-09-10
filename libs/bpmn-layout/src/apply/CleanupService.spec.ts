import { describe, expect, it, vi } from "vitest";

import type { ModdleNode } from "../cleanup/rules";
import { CLEANUP_COMMAND } from "./CleanupHandlers";
import { CleanupService } from "./CleanupService";

function model(): { definitions: ModdleNode; orphanDi: ModdleNode; ghost: ModdleNode } {
    const ghost: ModdleNode = { $type: "bpmn:Task", id: "Task_ghost" };
    const orphanDi: ModdleNode = {
        $type: "bpmndi:BPMNShape",
        id: "Orphan_di",
        bpmnElement: { id: "Task_gone" },
    };
    const process: ModdleNode = {
        $type: "bpmn:Process",
        id: "Process_1",
        flowElements: [ghost],
    };
    ghost.$parent = process;

    const definitions: ModdleNode = {
        $type: "bpmn:Definitions",
        rootElements: [process],
        diagrams: [
            {
                $type: "bpmndi:BPMNDiagram",
                id: "Diagram_1",
                plane: {
                    $type: "bpmndi:BPMNPlane",
                    bpmnElement: { id: "Process_1" },
                    planeElement: [orphanDi],
                },
            },
        ],
    };
    return { definitions, orphanDi, ghost };
}

function build(knownIds: string[] = []) {
    const { definitions, orphanDi, ghost } = model();
    const commandStack = { execute: vi.fn() };
    const elements = new Map(knownIds.map((id) => [id, { id }]));
    const bpmnjs = { getDefinitions: vi.fn(() => definitions) };
    const service = new CleanupService(
        { get: (id: string) => elements.get(id) },
        commandStack,
        bpmnjs,
    );
    return { service, commandStack, bpmnjs, definitions, orphanDi, ghost };
}

describe("CleanupService", () => {
    it("reports findings without changing anything", () => {
        const { service, commandStack } = build();

        const outcome = service.inspect();

        expect(outcome.status).toBe("reported");
        expect(outcome.items.map((item) => item.kind).sort()).toEqual([
            "isolated-node",
            "orphan-di",
        ]);
        expect(commandStack.execute).not.toHaveBeenCalled();
    });

    it("applies through a single layout.cleanup command", () => {
        const { service, commandStack } = build(["Task_ghost"]);

        const applied = service.apply();

        expect(applied.status).toBe("applied");
        expect(applied.items.map((item) => item.kind).sort()).toEqual([
            "isolated-node",
            "orphan-di",
        ]);
        expect(commandStack.execute).toHaveBeenCalledOnce();
        expect(commandStack.execute.mock.calls[0][0]).toBe(CLEANUP_COMMAND);
    });

    // The rules know the model, not which parts of it were rendered — so the
    // service is where a removal for something the registry never saw gets
    // turned into a moddle splice.
    it("turns a removal the registry never saw into a splice on its parent", () => {
        const { service, commandStack, ghost } = build();

        service.apply();

        const actions = commandStack.execute.mock.calls[0][1].actions;
        expect(actions).toContainEqual(
            expect.objectContaining({ kind: "splice", node: ghost, index: 0 }),
        );
        expect(actions).not.toContainEqual(expect.objectContaining({ kind: "remove-element" }));
    });

    it("keeps a removal as an element removal when the registry knows it", () => {
        const { service, commandStack } = build(["Task_ghost"]);

        service.apply();

        expect(commandStack.execute.mock.calls[0][1].actions).toContainEqual({
            kind: "remove-element",
            id: "Task_ghost",
        });
    });

    // The user confirms in a host dialog and may edit in between, so the ids
    // from the report are not what gets deleted.
    it("recomputes on apply rather than trusting the reported findings", () => {
        const { service, commandStack, definitions } = build();
        service.inspect();

        // The user fixes the orphan DI and deletes the ghost task themselves.
        (definitions.diagrams as ModdleNode[])[0].plane = {
            $type: "bpmndi:BPMNPlane",
            bpmnElement: { id: "Process_1" },
            planeElement: [],
        };
        (definitions.rootElements as ModdleNode[])[0].flowElements = [];

        expect(service.apply()).toEqual({ status: "applied", items: [] });
        expect(commandStack.execute).not.toHaveBeenCalled();
    });
});

/**
 * An empty item list is what the host turns into "nothing to clean up", so it
 * has to mean the diagram was clean and nothing else.
 */
describe("CleanupService failure reporting", () => {
    it("reports a failed inspection instead of an empty report", () => {
        const { service, bpmnjs } = build();
        bpmnjs.getDefinitions.mockImplementation(() => {
            throw new Error("model unreadable");
        });

        expect(service.inspect()).toEqual({
            status: "failed",
            items: [],
            message: "model unreadable",
        });
    });

    it("reports a failed apply instead of an empty report", () => {
        const { service, commandStack } = build(["Task_ghost"]);
        commandStack.execute.mockImplementation(() => {
            throw new Error("command stack exploded");
        });

        expect(service.apply()).toEqual({
            status: "failed",
            items: [],
            message: "command stack exploded",
        });
    });
});
