import { describe, expect, it } from "vitest";

import { collectCandidates } from "./candidates";
import { fakeDiagram, labelOf, moddle, shape } from "./__fixtures__/diagram";

describe("collectCandidates", () => {
    it("lists named and unnamed flow elements with their kind, skipping labels", () => {
        const task = shape("bpmn:UserTask", "Activity_1", "Check stock");
        const event = shape("bpmn:StartEvent", "Event_1", "Order received");
        const flow = shape("bpmn:SequenceFlow", "Flow_1");
        const { registry } = fakeDiagram([task, event, labelOf(event), flow]);

        expect(collectCandidates(registry).map(({ id, name, kind }) => [id, name, kind])).toEqual([
            ["Activity_1", "Check stock", "activity"],
            ["Event_1", "Order received", "event"],
            ["Flow_1", "", "flow"],
        ]);
    });

    it("leaves out elements whose text is not a name", () => {
        const { registry } = fakeDiagram([
            shape("bpmn:TextAnnotation", "TextAnnotation_1"),
            shape("bpmn:Group", "Group_1"),
            shape("bpmn:Association", "Association_1"),
            shape("bpmn:DataInputAssociation", "DataInputAssociation_1"),
            shape("bpmn:Collaboration", "Collaboration_1"),
        ]);

        expect(collectCandidates(registry)).toEqual([]);
    });

    it("lists a collapsed sub-process once, through its shape rather than its plane", () => {
        const subProcess = shape("bpmn:SubProcess", "Activity_sub", "Review");
        const plane = {
            id: "Activity_sub_plane",
            type: "bpmn:SubProcess",
            businessObject: subProcess.businessObject,
        };
        const { registry } = fakeDiagram([plane as typeof subProcess, subProcess]);

        const candidates = collectCandidates(registry);

        expect(candidates).toHaveLength(1);
        expect(candidates[0]?.target).toEqual({ kind: "element", element: subProcess });
    });

    it("adds a pool's process, named after the pool when it has no name of its own", () => {
        const pool = shape("bpmn:Participant", "Participant_1", "Order handling");
        pool.businessObject.processRef = moddle("bpmn:Process", "Process_1");
        const { registry } = fakeDiagram([pool]);

        const [participant, process] = collectCandidates(registry);

        expect(participant).toMatchObject({ id: "Participant_1", kind: "participant" });
        expect(process).toMatchObject({
            id: "Process_1",
            name: "Order handling",
            kind: "process",
            shown: pool,
        });
        expect(process?.target).toEqual({
            kind: "process",
            participant: pool,
            process: pool.businessObject.processRef,
        });
    });

    it("prefers the process's own name over the pool's", () => {
        const pool = shape("bpmn:Participant", "Participant_1", "Order handling");
        pool.businessObject.processRef = moddle("bpmn:Process", "Process_1", "Fulfilment");
        const { registry } = fakeDiagram([pool]);

        expect(collectCandidates(registry)[1]?.name).toBe("Fulfilment");
    });

    it("lists a process two pools share once", () => {
        const process = moddle("bpmn:Process", "Process_1");
        const first = shape("bpmn:Participant", "Participant_1", "A");
        const second = shape("bpmn:Participant", "Participant_2", "B");
        first.businessObject.processRef = process;
        second.businessObject.processRef = process;
        const { registry } = fakeDiagram([first, second]);

        expect(collectCandidates(registry).map((c) => c.id)).toEqual([
            "Participant_1",
            "Process_1",
            "Participant_2",
        ]);
    });
});
