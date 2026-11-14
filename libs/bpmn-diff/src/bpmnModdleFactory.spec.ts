/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { moddleDescriptor, resolveBpmnModdleFactory } from "./bpmnModdleFactory";
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

describe("moddleDescriptor", () => {
    const descriptor = { prefix: "camunda", uri: "http://camunda.org/schema/1.0/bpmn" };

    it("takes the default export when the module has one", () => {
        expect(moddleDescriptor({ default: descriptor })).toBe(descriptor);
    });

    it("takes the module itself when it has no default export", () => {
        expect(moddleDescriptor(descriptor)).toBe(descriptor);
    });
});
