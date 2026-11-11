import { describe, expect, it } from "vitest";

import { ElementIdsService } from "./ElementIdsService";
import { RENAME_ELEMENT_IDS_COMMAND, type RenameContext } from "./RenameElementIdsHandler";
import { fakeDiagram, labelOf, shape, type FakeElement } from "./__fixtures__/diagram";

function setUp(elements: FakeElement[], extraIds: Record<string, unknown> = {}) {
    const { registry, moddle } = fakeDiagram(elements, extraIds);
    const executed: { command: string; context: RenameContext }[] = [];
    const service = new ElementIdsService(registry, moddle, {
        execute: (command, context) =>
            executed.push({ command, context: context as RenameContext }),
    });
    return { service, executed };
}

const stepsOf = (context: RenameContext) => context.steps.map(({ from, to }) => `${from}>${to}`);

describe("ElementIdsService", () => {
    it("starts with the default style and IDs that do not follow names", () => {
        expect(setUp([]).service.getSettings()).toEqual({ style: "typePrefix", followName: false });
    });

    it("takes settings one at a time", () => {
        const { service } = setUp([]);

        service.configure({ followName: true });
        service.configure({ style: "snakeCase" });

        expect(service.getSettings()).toEqual({ style: "snakeCase", followName: true });
    });

    it("proposes around IDs that other model elements, DI and labels hold", () => {
        const task = shape("bpmn:Task", "Activity_1", "Notify");
        const event = shape("bpmn:StartEvent", "Event_1", "Start");
        const { service } = setUp([task, event, labelOf(event)], {
            Activity_Notify: { $type: "bpmn:Message" },
        });

        expect(service.propose().map((p) => p.newId)).toEqual(["Activity_Notify_2", "Event_Start"]);
    });

    it("never proposes the ID of a label or a sub-process plane", () => {
        const task = shape("bpmn:Task", "Activity_1", "Review");
        const plane = {
            id: "Activity_Review",
            type: "bpmn:SubProcess",
            businessObject: shape("bpmn:SubProcess", "X").businessObject,
        };
        const { service } = setUp([task, plane as FakeElement]);

        expect(service.propose()[0]?.newId).toBe("Activity_Review_2");
    });

    it("renames every checked element in one command, swaps through a temporary ID", () => {
        const a = shape("bpmn:Task", "Activity_A", "B");
        const b = shape("bpmn:Task", "Activity_B", "A");
        const c = shape("bpmn:Task", "Activity_c", "C");
        const { service, executed } = setUp([a, b, c]);

        expect(service.rename("typePrefix", new Set(["Activity_c"]))).toBe(2);

        expect(executed.map((e) => e.command)).toEqual([RENAME_ELEMENT_IDS_COMMAND]);
        expect(stepsOf(executed[0]!.context)).toEqual([
            "Activity_A>Activity_A_tmp",
            "Activity_B>Activity_A",
            "Activity_A_tmp>Activity_B",
        ]);
    });

    it("runs no command when nothing changes, so no empty undo step is left", () => {
        const { service, executed } = setUp([
            shape("bpmn:Task", "Activity_Done", "Done"),
            shape("bpmn:Task", "x", ""),
        ]);

        expect(service.rename()).toBe(0);
        expect(executed).toEqual([]);
    });

    it("renames in the style the review picked rather than the setting", () => {
        const { service, executed } = setUp([shape("bpmn:UserTask", "Activity_1", "Process data")]);

        service.rename("typeSuffix");

        expect(stepsOf(executed[0]!.context)).toEqual(["Activity_1>ProcessDataTask"]);
    });

    describe("one element", () => {
        it("proposes against every other ID in the diagram, from the element or its label", () => {
            const event = shape("bpmn:StartEvent", "Event_1", "Start");
            const label = labelOf(event);
            const other = shape("bpmn:StartEvent", "Event_Start", "Elsewhere");
            const { service } = setUp([event, label, other]);

            expect(service.proposalFor(label)).toMatchObject({
                status: "rename",
                newId: "Event_Start_2",
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
            const done = shape("bpmn:Task", "Activity_ShipOrder", "Ship order");
            const { service, executed } = setUp([fresh, done]);

            expect(service.renameFromName(fresh)).toBe(true);
            expect(service.renameFromName(done)).toBe(false);
            expect(executed.map((e) => stepsOf(e.context))).toEqual([
                ["Activity_0x1y2z3>Activity_CheckStock"],
            ]);
        });

        it("uses the configured style", () => {
            const task = shape("bpmn:Task", "Activity_1", "Check stock");
            const { service } = setUp([task]);
            service.configure({ style: "snakeCase" });

            expect(service.proposalFor(task)?.newId).toBe("activity_check_stock");
        });
    });
});
