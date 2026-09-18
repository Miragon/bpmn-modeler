import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DefaultBpmnlintConfigService } from "../../service/DefaultBpmnlintConfigService";
import { NodeBpmnLinter } from "./NodeBpmnLinter";

// A tmp dir has no `node_modules` up its tree, so the workspace NodeResolver
// misses and resolution falls back to the bundled built-in rules — the same path
// a real workspace without `bpmnlint` installed takes.
const CONFIG_PATH = join(tmpdir(), ".bpmnlintrc");

const BPMN_WITH_TASK = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="Do the thing" />
  </bpmn:process>
</bpmn:definitions>`;

describe("NodeBpmnLinter", () => {
    it("resolves built-in rules from the bundled fallback and reports findings", async () => {
        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            CONFIG_PATH,
            { extends: "bpmnlint:recommended" },
        );

        expect(unresolved).toEqual([]);
        // recommended flags the process's missing start event.
        expect(Object.keys(results)).toContain("start-event-required");
    });

    it("skips a custom rule it cannot resolve and records it instead of throwing", async () => {
        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            CONFIG_PATH,
            { rules: { "custom-plugin/no-such-rule": "error" } },
        );

        // bpmnlint normalises the short pkg to its `bpmnlint-plugin-*` name before
        // resolution, which is exactly the package the user must install.
        expect(unresolved).toContain("bpmnlint-plugin-custom-plugin/no-such-rule");
        // The missing rule contributes no findings; nothing else was configured.
        expect(results).toEqual({});
    });

    it("skips an unresolvable plugin config without aborting the lint", async () => {
        const { unresolved } = await new NodeBpmnLinter().lint(BPMN_WITH_TASK, CONFIG_PATH, {
            extends: ["bpmnlint:recommended", "plugin:custom-plugin/recommended"],
        });

        expect(unresolved).toContain("plugin:bpmnlint-plugin-custom-plugin/recommended");
    });

    // A connected C8 service task with no `zeebe:taskDefinition` — a canonical
    // deploy-breaker the camunda-compat `implementation` rule flags.
    const BPMN_C8_UNIMPLEMENTED_SERVICE_TASK = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
    <bpmn:sequenceFlow id="Flow_1" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:serviceTask id="Task_1" name="Do the thing" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
    <bpmn:endEvent id="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

    it("lints against the bundled default and fires a camunda-compat C8 rule with everything resolved", async () => {
        const config = await new DefaultBpmnlintConfigService().build("c8");

        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_C8_UNIMPLEMENTED_SERVICE_TASK,
            CONFIG_PATH,
            config,
        );

        expect(unresolved).toEqual([]);
        expect(Object.keys(results)).toContain("camunda-compat/implementation");
    });

    // A label on an unconditional flow duplicates what the diagram already says —
    // bpmnlint 11.14.0's `superfluous-label` (recommended) flags it.
    const BPMN_LABELED_UNCONDITIONAL_FLOW = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
    <bpmn:sequenceFlow id="Flow_1" name="then" sourceRef="Start_1" targetRef="Task_1" />
    <bpmn:task id="Task_1" name="Do the thing" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_1" targetRef="End_1" />
    <bpmn:endEvent id="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

    // Labels that carry meaning: a conditional flow, a gateway's default flow, and
    // a fork out of an exclusive gateway — the rule's upstream exceptions.
    const BPMN_MEANINGFUL_FLOW_LABELS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="Start_1" />
    <bpmn:sequenceFlow id="Flow_In" sourceRef="Start_1" targetRef="Gateway_1" />
    <bpmn:exclusiveGateway id="Gateway_1" default="Flow_Default">
      <bpmn:outgoing>Flow_Conditional</bpmn:outgoing>
      <bpmn:outgoing>Flow_Fork</bpmn:outgoing>
      <bpmn:outgoing>Flow_Default</bpmn:outgoing>
    </bpmn:exclusiveGateway>
    <bpmn:sequenceFlow id="Flow_Conditional" name="yes" sourceRef="Gateway_1" targetRef="Task_1">
      <bpmn:conditionExpression>approved</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_Fork" name="maybe" sourceRef="Gateway_1" targetRef="Task_2" />
    <bpmn:sequenceFlow id="Flow_Default" name="no" sourceRef="Gateway_1" targetRef="Task_3" />
    <bpmn:task id="Task_1" name="Approve" />
    <bpmn:task id="Task_2" name="Review" />
    <bpmn:task id="Task_3" name="Reject" />
    <bpmn:sequenceFlow id="Flow_End_1" sourceRef="Task_1" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_End_2" sourceRef="Task_2" targetRef="End_1" />
    <bpmn:sequenceFlow id="Flow_End_3" sourceRef="Task_3" targetRef="End_1" />
    <bpmn:endEvent id="End_1" />
  </bpmn:process>
</bpmn:definitions>`;

    it("reports a labeled unconditional sequence flow via the bundled superfluous-label rule", async () => {
        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_LABELED_UNCONDITIONAL_FLOW,
            CONFIG_PATH,
            { extends: "bpmnlint:recommended" },
        );

        expect(unresolved).toEqual([]);
        expect(results["superfluous-label"]).toEqual([expect.objectContaining({ id: "Flow_1" })]);
    });

    it("keeps conditional, default, and gateway-fork labels exempt from superfluous-label", async () => {
        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_MEANINGFUL_FLOW_LABELS,
            CONFIG_PATH,
            { extends: "bpmnlint:recommended" },
        );

        expect(unresolved).toEqual([]);
        expect(results["superfluous-label"]).toBeUndefined();
    });

    it("reports base bpmnlint:recommended findings under the bundled default", async () => {
        const config = await new DefaultBpmnlintConfigService().build(undefined);

        const { results, unresolved } = await new NodeBpmnLinter().lint(
            BPMN_WITH_TASK,
            CONFIG_PATH,
            config,
        );

        expect(unresolved).toEqual([]);
        expect(Object.keys(results)).toContain("start-event-required");
    });
});
