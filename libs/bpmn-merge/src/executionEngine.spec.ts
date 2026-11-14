import { describe, expect, it } from "vitest";

import { baseModel, removeNode } from "./__fixtures__/baseModel";
import { renderBpmn } from "./__fixtures__/bpmnModelBuilder";
import { executionEngineOf } from "./executionEngine";

const MODELER_NAMESPACE = "http://camunda.org/schema/modeler/1.0";
const CAMUNDA_NAMESPACE = "http://camunda.org/schema/1.0/bpmn";
const ZEEBE_NAMESPACE = "http://camunda.org/schema/zeebe/1.0";

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
                `xmlns:modeler="${MODELER_NAMESPACE}" modeler:executionPlatform="Camunda Cloud"`,
            ),
            engine: "zeebe",
        },
        {
            given: "a Camunda 7 execution platform that also declares the zeebe namespace",
            xml: definitions(
                `xmlns:camunda="${CAMUNDA_NAMESPACE}" xmlns:zeebe="${ZEEBE_NAMESPACE}" xmlns:modeler="${MODELER_NAMESPACE}" modeler:executionPlatform="Camunda Platform"`,
            ),
            engine: "camunda",
        },
        {
            given: "an execution platform version alone",
            xml: definitions(
                `xmlns:modeler="${MODELER_NAMESPACE}" modeler:executionPlatformVersion="8.6.0"`,
            ),
            engine: "zeebe",
        },
        {
            given: "both engine namespaces and no execution platform",
            xml: definitions(
                `xmlns:camunda="${CAMUNDA_NAMESPACE}" xmlns:zeebe="${ZEEBE_NAMESPACE}"`,
            ),
            engine: "camunda",
        },
        {
            given: "the zeebe namespace alone",
            xml: definitions(`xmlns:zeebe="${ZEEBE_NAMESPACE}"`),
            engine: "zeebe",
        },
        {
            given: "a zeebe namespace declared only on a nested element",
            xml: definitions("", `xmlns:zeebe="${ZEEBE_NAMESPACE}"`),
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
