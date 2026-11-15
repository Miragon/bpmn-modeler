import { describe, expect, it } from "vitest";

import { loadBpmnModdle } from "./bpmnModdleFactory";
import {
    type ModdleElement,
    idOf,
    idsOf,
    isModdleElement,
    isType,
    moddleElements,
} from "./moddleElement";

describe("isType", () => {
    const XML = `<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:custom="urn:miragon:custom" id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:serviceTask id="Task_1">
      <bpmn:extensionElements><custom:meta owner="billing" /></bpmn:extensionElements>
    </bpmn:serviceTask>
  </bpmn:process>
</bpmn:definitions>`;

    it.each([
        ["a service task", "Task_1", "bpmn:ServiceTask", true],
        ["a service task", "Task_1", "bpmn:FlowElement", true],
        ["a service task", "Task_1", "bpmn:Process", false],
        ["a process", "Process_1", "bpmn:Process", true],
    ])("tells whether %s (%s) is a %s", async (_label, id, type, expected) => {
        const { elementsById } = await (await loadBpmnModdle())().fromXML(XML);

        expect(isType(elementsById[id]!, type)).toBe(expected);
    });

    it.each([
        ["custom:meta", true],
        ["bpmn:BaseElement", false],
    ])("tells whether a generic extension element is a %s", async (type, expected) => {
        const { elementsById } = await (await loadBpmnModdle())().fromXML(XML);
        const extensionElements = elementsById.Task_1!.extensionElements as ModdleElement;
        const genericElement = (extensionElements.values as ModdleElement[])[0]!;

        expect(isType(genericElement, type)).toBe(expected);
    });

    it("matches by type name an element that cannot answer instance checks", () => {
        const element = { $type: "custom:meta", $descriptor: {} };

        expect(isType(element, "custom:meta")).toBe(true);
        expect(isType(element, "bpmn:BaseElement")).toBe(false);
    });
});

describe("isModdleElement", () => {
    it.each([
        ["an element", { $type: "bpmn:Task", $descriptor: {} }, true],
        ["an object without a descriptor", { $type: "bpmn:Task" }, false],
        ["an object without a type", { $descriptor: {} }, false],
        ["a reference id", "Task_1", false],
        ["nothing", undefined, false],
    ])("tells whether %s is a moddle element", (_label, value, expected) => {
        expect(isModdleElement(value)).toBe(expected);
    });
});

describe("moddle lists and ids", () => {
    const task = { $type: "bpmn:Task", $descriptor: {}, id: "Task_1" };
    const unnamed = { $type: "bpmn:Task", $descriptor: {} };

    it.each([
        ["a list", [task, "Task_2", unnamed], [task, unnamed]],
        ["an unset list", undefined, []],
        ["a single element", task, []],
    ])("takes the elements of %s", (_label, value, expected) => {
        expect(moddleElements(value)).toEqual(expected);
    });

    it.each([
        ["an element", task, "Task_1"],
        ["an element without an id", unnamed, undefined],
        ["a reference id", "Task_1", undefined],
    ])("reads the id of %s", (_label, value, expected) => {
        expect(idOf(value)).toBe(expected);
    });

    it.each([
        ["a list", [task, unnamed, "Task_2", task], ["Task_1", "Task_1"]],
        ["an unset list", undefined, []],
    ])("reads the ids of %s, repeats kept", (_label, value, expected) => {
        expect(idsOf(value)).toEqual(expected);
    });
});
