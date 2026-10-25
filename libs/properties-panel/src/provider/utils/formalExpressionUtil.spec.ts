import { describe, expect, it } from "vitest";

import {
    BPMN_NAMESPACES,
    createPanelServices,
    type ModdleElement,
} from "../../__fixtures__/panelHarness";
import { createOrUpdateFormalExpression } from "./FormalExpressionUtil";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${BPMN_NAMESPACES} id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1">
      <bpmn:multiInstanceLoopCharacteristics id="Loop_1">
        <bpmn:completionCondition xsi:type="bpmn:tFormalExpression">\${done}</bpmn:completionCondition>
      </bpmn:multiInstanceLoopCharacteristics>
    </bpmn:task>
  </bpmn:process>
</bpmn:definitions>`;

async function setup() {
    const { injector, commandStack, elementsById, shapeOf } = await createPanelServices(XML);
    const loop = elementsById.Loop_1;
    const write = (propertyName: string, value: string) =>
        createOrUpdateFormalExpression(
            shapeOf("Task_1"),
            loop,
            propertyName,
            value,
            injector.get("bpmnFactory"),
            commandStack,
        );
    return { loop, write };
}

describe("createOrUpdateFormalExpression", () => {
    it("adds an expression owned by the element when none exists", async () => {
        const { loop, write } = await setup();

        write("loopCardinality", "5");

        const cardinality: ModdleElement = loop.get("loopCardinality");
        expect(cardinality.$type).toBe("bpmn:FormalExpression");
        expect(cardinality.$parent).toBe(loop);
        expect(cardinality.get("body")).toBe("5");
    });

    it("edits the existing expression in place instead of adding a second one", async () => {
        const { loop, write } = await setup();
        const condition = loop.get("completionCondition");

        write("completionCondition", "${finished}");

        expect(loop.get("completionCondition")).toBe(condition);
        expect(condition.get("body")).toBe("${finished}");
    });

    it("removes the expression for an empty value", async () => {
        const { loop, write } = await setup();

        write("completionCondition", "");

        expect(loop.get("completionCondition")).toBeUndefined();
    });
});
