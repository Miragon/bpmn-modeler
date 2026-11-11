import { describe, expect, it } from "vitest";

import type { RenameTarget } from "./candidates";
import {
    RenameElementIdsHandler,
    UPDATE_LABEL_ID_COMMAND,
    UpdateLabelIdHandler,
    type ModelingLike,
} from "./RenameElementIdsHandler";
import { fakeDiagram, labelOf, moddle, shape, type FakeElement } from "./__fixtures__/diagram";

/** Records what the handler asks bpmn-js to do, and applies the ID changes the way bpmn-js would. */
function setUp(elements: FakeElement[], extraIds: Record<string, unknown> = {}) {
    const calls: string[] = [];
    const { registry, moddle: model } = fakeDiagram(elements, extraIds);
    const modeling: ModelingLike = {
        updateProperties(element, properties) {
            calls.push(`updateProperties ${element.id} ${JSON.stringify(properties)}`);
            const target = element as FakeElement;
            if (typeof properties.id === "string") {
                target.id = properties.id;
                target.businessObject.id = properties.id;
            }
            const di = properties.di as { id?: string } | undefined;
            if (di?.id && target.di) {
                target.di.id = di.id;
            }
        },
        updateModdleProperties(element, moddleElement, properties) {
            calls.push(
                `updateModdleProperties ${element.id} ${moddleElement.id} ${JSON.stringify(properties)}`,
            );
            (moddleElement as { id?: string }).id = properties.id as string;
        },
        claimId: (id) => calls.push(`claim ${id}`),
        unclaimId: (id) => calls.push(`unclaim ${id}`),
    };
    const commandStack = {
        execute: (command: string, context: { id: string }) =>
            calls.push(`${command} ${context.id}`),
    };
    const handler = new RenameElementIdsHandler(modeling, model, registry, commandStack);
    return { calls, handler };
}

const elementTarget = (element: FakeElement): RenameTarget => ({ kind: "element", element });

describe("RenameElementIdsHandler", () => {
    it("renames the element, then its DI and its label, which still follow the old ID", () => {
        const event = shape("bpmn:StartEvent", "Event_0x1y2z3", "Order received");
        const label = labelOf(event);
        const { calls, handler } = setUp([event, label]);

        handler.preExecute({
            steps: [
                { item: elementTarget(event), from: "Event_0x1y2z3", to: "Event_OrderReceived" },
            ],
        });

        expect(calls).toEqual([
            'updateProperties Event_0x1y2z3 {"id":"Event_OrderReceived"}',
            "unclaim Event_0x1y2z3_di",
            'updateProperties Event_OrderReceived {"di":{"id":"Event_OrderReceived_di"}}',
            "claim Event_OrderReceived_di",
            `${UPDATE_LABEL_ID_COMMAND} Event_OrderReceived_label`,
        ]);
    });

    it("leaves a DI ID that does not follow the element's ID, and one whose new spelling is taken", () => {
        const task = shape("bpmn:Task", "Activity_a", "A", { di: { id: "Shape_42" } });
        const other = shape("bpmn:Task", "Activity_b", "B");
        const { calls, handler } = setUp([task, other], { Activity_B_di: {} });

        handler.preExecute({
            steps: [
                { item: elementTarget(task), from: "Activity_a", to: "Activity_A" },
                { item: elementTarget(other), from: "Activity_b", to: "Activity_B" },
            ],
        });

        expect(calls).toEqual([
            'updateProperties Activity_a {"id":"Activity_A"}',
            'updateProperties Activity_b {"id":"Activity_B"}',
        ]);
    });

    it("swaps the DI and label IDs of two elements that swap IDs", () => {
        const a = shape("bpmn:StartEvent", "Event_A", "B");
        const b = shape("bpmn:StartEvent", "Event_B", "A");
        const labels = [labelOf(a), labelOf(b)];
        const { handler } = setUp([a, b, ...labels]);
        const targetA = elementTarget(a);
        const targetB = elementTarget(b);

        handler.preExecute({
            steps: [
                { item: targetA, from: "Event_A", to: "Event_A_tmp" },
                { item: targetB, from: "Event_B", to: "Event_A" },
                { item: targetA, from: "Event_A_tmp", to: "Event_B" },
            ],
        });

        expect([a.id, a.di?.id, b.id, b.di?.id]).toEqual([
            "Event_B",
            "Event_B_di",
            "Event_A",
            "Event_A_di",
        ]);
    });

    it("leaves the labels of swapped elements to their own command, once each, in a safe order", () => {
        const a = shape("bpmn:StartEvent", "Event_A", "B");
        const b = shape("bpmn:StartEvent", "Event_B", "A");
        const labels = [labelOf(a), labelOf(b)];
        const { calls, handler } = setUp([a, b, ...labels]);
        const targetA = elementTarget(a);

        handler.preExecute({
            steps: [
                { item: targetA, from: "Event_A", to: "Event_A_tmp" },
                { item: elementTarget(b), from: "Event_B", to: "Event_A" },
                { item: targetA, from: "Event_A_tmp", to: "Event_B" },
            ],
        });

        expect(calls.filter((call) => call.startsWith(UPDATE_LABEL_ID_COMMAND))).toEqual([
            `${UPDATE_LABEL_ID_COMMAND} Event_A_label_tmp`,
            `${UPDATE_LABEL_ID_COMMAND} Event_A_label`,
            `${UPDATE_LABEL_ID_COMMAND} Event_B_label`,
        ]);
    });

    it("renames a pool's process through its participant and keeps the ID registry in step", () => {
        const pool = shape("bpmn:Participant", "Participant_1", "Orders");
        const process = moddle("bpmn:Process", "Process_1");
        pool.businessObject.processRef = process;
        const { calls, handler } = setUp([pool]);

        handler.preExecute({
            steps: [
                {
                    item: { kind: "process", participant: pool, process },
                    from: "Process_1",
                    to: "Process_Orders",
                },
            ],
        });

        expect(calls).toEqual([
            "unclaim Process_1",
            'updateModdleProperties Participant_1 Process_1 {"id":"Process_Orders"}',
            "claim Process_Orders",
        ]);
    });
});

describe("UpdateLabelIdHandler", () => {
    it("renames a label in the registry and puts it back on revert", () => {
        const event = shape("bpmn:StartEvent", "Event_A", "A");
        const label = labelOf(event);
        const { registry } = fakeDiagram([event, label]);
        const handler = new UpdateLabelIdHandler(registry);
        const context: { label: FakeElement; id: string; oldId?: string } = {
            label,
            id: "Event_B_label",
        };

        expect(handler.execute(context)).toEqual([]);
        expect(label.id).toBe("Event_B_label");

        expect(handler.revert(context)).toEqual([]);
        expect(label.id).toBe("Event_A_label");
    });
});
