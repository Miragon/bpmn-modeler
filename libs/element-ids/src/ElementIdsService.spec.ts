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
