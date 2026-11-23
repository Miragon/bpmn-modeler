import { ENGINE_NAMESPACE, MODELER_NAMESPACE_URI } from "@miragon/bpmn-modeler-types/engine";
import { describe, expect, it } from "vitest";

import { baseModel, removeNode } from "../../__fixtures__/baseModel";
import { renderBpmn } from "../../__fixtures__/bpmnModelBuilder";
import { executionEngineOf } from "./executionEngine";

function definitions(attributes: string, processAttributes = ""): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ${attributes} id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" ${processAttributes} />
</bpmn:definitions>`;
}

describe("executionEngineOf", () => {
    it.each([
        { platform: "c7", engine: "camunda" },
        { platform: "c8", engine: "zeebe" },
    ] as const)("names $engine for a $platform document", ({ platform, engine }) => {
        expect(executionEngineOf(renderBpmn(baseModel(platform)))).toBe(engine);
    });

    it.each([
        {
            given: "a Camunda 8 execution platform without the zeebe namespace",
            xml: definitions(
                `xmlns:modeler="${MODELER_NAMESPACE_URI}" modeler:executionPlatform="Camunda Cloud"`,
            ),
            engine: "zeebe",
        },
        {
            given: "a Camunda 7 execution platform that also declares the zeebe namespace",
            xml: definitions(
                `xmlns:camunda="${ENGINE_NAMESPACE.c7.uri}" xmlns:zeebe="${ENGINE_NAMESPACE.c8.uri}" xmlns:modeler="${MODELER_NAMESPACE_URI}" modeler:executionPlatform="Camunda Platform"`,
            ),
            engine: "camunda",
        },
        {
            given: "an execution platform version alone",
            xml: definitions(
                `xmlns:modeler="${MODELER_NAMESPACE_URI}" modeler:executionPlatformVersion="8.6.0"`,
            ),
            engine: "zeebe",
        },
        {
            given: "both engine namespaces and no execution platform",
            xml: definitions(
                `xmlns:camunda="${ENGINE_NAMESPACE.c7.uri}" xmlns:zeebe="${ENGINE_NAMESPACE.c8.uri}"`,
            ),
            engine: "camunda",
        },
        {
            given: "the zeebe namespace alone",
            xml: definitions(`xmlns:zeebe="${ENGINE_NAMESPACE.c8.uri}"`),
            engine: "zeebe",
        },
        {
            given: "a zeebe namespace declared only on a nested element",
            xml: definitions("", `xmlns:zeebe="${ENGINE_NAMESPACE.c8.uri}"`),
            engine: undefined,
        },
    ])("names $engine for $given", ({ xml, engine }) => {
        expect(executionEngineOf(xml)).toBe(engine);
    });

    it("names none when the document declares no engine", () => {
        const model = removeNode(baseModel("c7"), "Task_Check");
        model.processAttributes = {};
        const withoutEngine = renderBpmn(model).replace(
            / modeler:executionPlatform(Version)?="[^"]*"/g,
            "",
        );

        expect(executionEngineOf(withoutEngine)).toBeUndefined();
    });
});
