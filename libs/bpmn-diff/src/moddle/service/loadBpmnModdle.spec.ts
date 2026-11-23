/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

import { loadBpmnModdle } from "../../index";

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
            ["../../**/*.ts", "!../../**/*.spec.ts", "!../../__fixtures__/**"],
            { query: "?raw", import: "default", eager: true },
        );

        const eagerImports = Object.entries(productionSources)
            .filter(([, source]) =>
                /^(?:import|export)\s(?!type\s)(?:[^;]*from\s+)?["'](bpmn-moddle|bpmn-js-differ|saxen|[\w-]+-moddle\/resources\/[\w-]+\.json)["']/m.test(
                    source,
                ),
            )
            .map(([path]) => path);

        expect(Object.keys(productionSources)).toContain("../../snapshot/service/elementXml.ts");
        expect(eagerImports).toEqual([]);
    });
});
