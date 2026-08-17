// @vitest-environment node
import { describe, expect, it } from "vitest";

import { lintBpmnXml } from "./browserLintRunner";
import { MOCK_BPMN_XML } from "./__fixtures__/mock-bpmn";

// A well-formed diagram with a single unnamed, disconnected task: enough to
// produce real findings without duplicate sequence flows, so the idempotency
// check below would catch state leaking across relints.
const XML_WITH_FINDINGS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

describe("lintBpmnXml", () => {
    it("reports no findings for a valid diagram", async () => {
        const results = await lintBpmnXml(MOCK_BPMN_XML);
        const findings = Object.values(results).flat();
        expect(findings).toEqual([]);
    });

    it("reports real findings against recommended rules", async () => {
        const results = await lintBpmnXml(XML_WITH_FINDINGS);
        // Task_1 has no name and no outgoing flow.
        expect(results["label-required"]).toBeDefined();
        expect(results["no-implicit-end"]).toBeDefined();
    });

    it("is idempotent across relints (no leaked rule state)", async () => {
        // Regression: bpmnlint caches rule instances for a linter's lifetime, so
        // a shared linter carried stateful-rule closures (e.g.
        // no-duplicate-sequence-flows) into the next run and flagged every flow
        // as a duplicate. A fresh linter per call must yield identical results.
        const first = await lintBpmnXml(MOCK_BPMN_XML);
        const second = await lintBpmnXml(MOCK_BPMN_XML);
        expect(second).toEqual(first);

        const firstWithFindings = await lintBpmnXml(XML_WITH_FINDINGS);
        const secondWithFindings = await lintBpmnXml(XML_WITH_FINDINGS);
        expect(secondWithFindings).toEqual(firstWithFindings);
        expect(secondWithFindings["no-duplicate-sequence-flows"]).toBeUndefined();
    });
});
