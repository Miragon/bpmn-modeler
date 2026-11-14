import { naming } from "@miragon/bpmnlint-plugin-rules";
import { describe, expect, it } from "vitest";

import { FALLBACK_CONVENTION } from "./convention";
import { ElementIdsService } from "./ElementIdsService";
import { RENAME_ELEMENT_IDS_COMMAND, type RenameContext } from "./RenameElementIdsHandler";
import { fakeDiagram, labelOf, moddle, shape, type FakeElement } from "./__fixtures__/diagram";

const miragon = new naming.ElementIdConvention();

function setUp(elements: FakeElement[], extraIds: Record<string, unknown> = {}) {
    const { registry, moddle } = fakeDiagram(elements, extraIds);
    const executed: { command: string; context: RenameContext }[] = [];
    const service = new ElementIdsService(registry, moddle, {
        execute: (command, context) =>
            executed.push({ command, context: context as RenameContext }),
    });
    service.configure({ convention: miragon });
    return { service, executed };
}

const stepsOf = (context: RenameContext) => context.steps.map(({ from, to }) => `${from}>${to}`);

describe("ElementIdsService", () => {
    it("starts with IDs that do not follow names and the fallback convention", () => {
        const { registry, moddle } = fakeDiagram([]);
        const service = new ElementIdsService(registry, moddle, { execute: () => undefined });

        expect(service.getSettings()).toEqual({ followName: false });
        expect(service.getConvention()).toBe(FALLBACK_CONVENTION);
    });

    it("takes settings and the convention one at a time", () => {
        const { service } = setUp([]);

        service.configure({ followName: true });
        service.configure({});

        expect(service.getSettings()).toEqual({ followName: true });
        expect(service.getConvention()).toBe(miragon);
    });

    it("proposes around IDs that other model elements, DI and labels hold", () => {
        const task = shape("bpmn:Task", "Activity_1", "Notify");
        const event = shape("bpmn:StartEvent", "Event_1", "Start");
        const { service } = setUp([task, event, labelOf(event)], {
            task_notify: { $type: "bpmn:Message" },
        });

        expect(service.propose().map((p) => p.newId)).toEqual(["task_notify2", "startEvent_start"]);
    });

    it("never proposes the ID of a label or a sub-process plane", () => {
        const task = shape("bpmn:Task", "Activity_1", "Review");
        const plane = {
            id: "task_review",
            type: "bpmn:SubProcess",
            businessObject: shape("bpmn:SubProcess", "X").businessObject,
        };
        const { service } = setUp([task, plane as FakeElement]);

        expect(service.propose()[0]?.newId).toBe("task_review2");
    });

    it("renames every checked element in one command, swaps through a temporary ID", () => {
        const a = shape("bpmn:Task", "task_a", "B");
        const b = shape("bpmn:Task", "task_b", "A");
        const c = shape("bpmn:Task", "task_c", "D");
        const { service, executed } = setUp([a, b, c]);

        expect(service.rename(new Set(["task_c"]))).toBe(2);

        expect(executed.map((e) => e.command)).toEqual([RENAME_ELEMENT_IDS_COMMAND]);
        expect(stepsOf(executed[0]!.context)).toEqual([
            "task_a>task_a_tmp",
            "task_b>task_a",
            "task_a_tmp>task_b",
        ]);
    });

    it("runs no command when nothing changes, so no empty undo step is left", () => {
        const { service, executed } = setUp([
            shape("bpmn:Task", "task_done", "Done"),
            shape("bpmn:Task", "x", ""),
        ]);

        expect(service.rename()).toBe(0);
        expect(executed).toEqual([]);
    });

    it("leaves process IDs unchecked at first, the root process's and a pool's", () => {
        const root = shape("bpmn:Process", "Process_1", "Order fulfilment");
        const pool = shape("bpmn:Participant", "Participant_1", "Order handling");
        pool.businessObject.processRef = moddle("bpmn:Process", "Process_2");
        const { service } = setUp([root, pool, shape("bpmn:Task", "Activity_1", "Check")]);

        expect([...service.initiallyUnchecked()]).toEqual(["Process_1", "Process_2"]);
    });

    it("spells IDs as the convention it was handed asks", () => {
        const { service, executed } = setUp([shape("bpmn:UserTask", "Activity_1", "Process data")]);
        service.configure({ convention: new naming.ElementIdConvention({ case: "snake_case" }) });

        service.rename();

        expect(stepsOf(executed[0]!.context)).toEqual(["Activity_1>userTask_process_data"]);
    });

    describe("rows for a host's own panel", () => {
        it("lists each row with its kind and the element to reveal, processes unchecked", () => {
            const pool = shape("bpmn:Participant", "Participant_1", "Order handling");
            pool.businessObject.processRef = moddle("bpmn:Process", "Process_1");
            const task = shape("bpmn:ServiceTask", "Activity_1", "Check stock");
            const { service } = setUp([pool, task]);

            expect(service.list()).toEqual({
                rows: [
                    {
                        id: "Participant_1",
                        name: "Order handling",
                        type: "bpmn:Participant",
                        kind: "participant",
                        status: "rename",
                        newId: "participant_orderHandling",
                        clash: false,
                        shownId: "Participant_1",
                    },
                    {
                        id: "Process_1",
                        name: "Order handling",
                        type: "bpmn:Process",
                        kind: "process",
                        status: "unchecked",
                        newId: "orderHandling",
                        clash: false,
                        shownId: "Participant_1",
                    },
                    {
                        id: "Activity_1",
                        name: "Check stock",
                        type: "bpmn:ServiceTask",
                        kind: "activity",
                        status: "rename",
                        newId: "serviceTask_checkStock",
                        clash: false,
                        shownId: "Activity_1",
                    },
                ],
                unchecked: ["Process_1"],
            });
        });

        it("keeps the IDs the host unchecked and leaves out the ID of a skipped row", () => {
            const { service } = setUp([
                shape("bpmn:Task", "Activity_1", "Notify"),
                shape("bpmn:Task", "Activity_2", ""),
            ]);

            const { rows, unchecked } = service.list(new Set(["Activity_1"]));

            expect(unchecked).toEqual(["Activity_1"]);
            expect(rows.map((row) => [row.status, row.newId])).toEqual([
                ["unchecked", "task_notify"],
                ["skipped", undefined],
            ]);
            expect(rows[1]).not.toHaveProperty("newId");
        });
    });

    describe("the host's own review", () => {
        it("keeps the review the host handed in", () => {
            const { service } = setUp([]);
            const openReview = () => undefined;

            expect(service.hostReview()).toBeUndefined();
            service.configure({ openReview });
            service.configure({ followName: true });

            expect(service.hostReview()).toBe(openReview);
        });
    });

    describe("one element", () => {
        it("proposes against every other ID in the diagram, from the element or its label", () => {
            const event = shape("bpmn:StartEvent", "Event_1", "Start");
            const label = labelOf(event);
            const other = shape("bpmn:StartEvent", "startEvent_start", "Elsewhere");
            const { service } = setUp([event, label, other]);

            expect(service.proposalFor(label)).toMatchObject({
                status: "rename",
                newId: "startEvent_start2",
                clash: true,
            });
        });

        it("has no proposal for an element without an ID of its own", () => {
            const { service } = setUp([shape("bpmn:TextAnnotation", "TextAnnotation_1")]);

            expect(
                service.proposalFor(shape("bpmn:TextAnnotation", "TextAnnotation_1")),
            ).toBeUndefined();
        });

        it("renames from the name only when the ID does not follow it yet", () => {
            const fresh = shape("bpmn:Task", "Activity_0x1y2z3", "Check stock");
            const done = shape("bpmn:Task", "task_shipOrder", "Ship order");
            const { service, executed } = setUp([fresh, done]);

            expect(service.renameFromName(fresh)).toBe(true);
            expect(service.renameFromName(done)).toBe(false);
            expect(executed.map((e) => stepsOf(e.context))).toEqual([
                ["Activity_0x1y2z3>task_checkStock"],
            ]);
        });
    });
});
