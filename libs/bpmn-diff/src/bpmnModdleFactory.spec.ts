/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { type ModdleElement, isType, resolveBpmnModdleFactory } from "./bpmnModdleFactory";
import { loadBpmnModdle } from "./index";

describe("resolveBpmnModdleFactory", () => {
    const factory = () => ({}) as never;

    it("takes the default export when the module has one", () => {
        expect(resolveBpmnModdleFactory({ default: factory, BpmnModdle: () => ({}) })).toBe(
            factory,
        );
    });

    it("falls back to the named BpmnModdle export", () => {
        expect(resolveBpmnModdleFactory({ BpmnModdle: factory })).toBe(factory);
    });

    it("throws when the module exposes neither", () => {
        expect(() => resolveBpmnModdleFactory({})).toThrow(
            "bpmn-moddle did not expose a factory under `default` or `BpmnModdle`.",
        );
    });
});

describe("loadBpmnModdle", () => {
    it("loads a factory whose moddle parses BPMN", async () => {
        const createBpmnModdle = await loadBpmnModdle();

        const { rootElement } = await createBpmnModdle().fromXML(
            '<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" />',
        );

        expect(rootElement.$type).toBe("bpmn:Definitions");
    });

    it("keeps the parsers, the descriptors and the differ out of every static import of the library", () => {
        const productionSources = import.meta.glob<string>(
            ["./**/*.ts", "!./**/*.spec.ts", "!./__fixtures__/**"],
            { query: "?raw", import: "default", eager: true },
        );

        const eagerImports = Object.entries(productionSources)
            .filter(([, source]) =>
                /^(?:import|export)\s(?!type\s)(?:[^;]*from\s+)?["'](bpmn-moddle|bpmn-js-differ|saxen|[\w-]+-moddle\/resources\/[\w-]+\.json)["']/m.test(
                    source,
                ),
            )
            .map(([path]) => path);

        expect(Object.keys(productionSources)).toContain("./elementXml.ts");
        expect(eagerImports).toEqual([]);
    });
});

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
