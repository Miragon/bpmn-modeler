import { describe, expect, it } from "vitest";

import { BPMN_NAMESPACES, createPanelServices } from "../__fixtures__/panelHarness";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${BPMN_NAMESPACES} id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

describe("properties-panel.multi-command-executor", () => {
    it("applies several updates as one undo and redo step", async () => {
        const { eventBus, commandStack, elementsById, shapeOf } = await createPanelServices(XML);
        const { Task_1: task, Process_1: process } = elementsById;
        const names = () => [task.get("name"), process.get("name")];
        eventBus.fire("diagram.init");

        commandStack!.execute("properties-panel.multi-command-executor", [
            {
                cmd: "element.updateModdleProperties",
                context: {
                    element: shapeOf("Task_1"),
                    moddleElement: task,
                    properties: { name: "Charge" },
                },
            },
            {
                cmd: "element.updateModdleProperties",
                context: {
                    element: shapeOf("Task_1"),
                    moddleElement: process,
                    properties: { name: "Billing" },
                },
            },
        ]);

        expect(names()).toEqual(["Charge", "Billing"]);

        commandStack!.undo();

        expect(names()).toEqual([undefined, undefined]);

        commandStack!.redo();

        expect(names()).toEqual(["Charge", "Billing"]);
    });

    it("loads inert on a viewer, which has no command stack", async () => {
        const { eventBus } = await createPanelServices(XML, { readonly: true });

        expect(() => eventBus.fire("diagram.init")).not.toThrow();
    });
});
