import { describe, expect, it } from "vitest";
import { loadBpmnModdle } from "@miragon/bpmn-modeler-diff";
import { getDefaultLintConfig } from "@miragon/bpmnlint-plugin-rules";

import { BrowserLinter } from "./browserLinter";
import { resolveLintConfig } from "./lintConfigResolution";

// The engine-aware default the resolver would hand the linter in Implement mode;
// BrowserLinter now takes the resolved config, not the engine.
const C7_DEFAULT = getDefaultLintConfig({ engine: "c7", preset: "modeling" });

/**
 * The browser-compat gate: `@miragon/bpmnlint-plugin-rules` and bpmnlint's
 * `Linter` have only ever run in Node here. This drives the real stack
 * (no mocks) over a parsed moddle tree in jsdom, so a rule reaching for a Node API
 * fails here — the earliest signal — rather than blank in a host webview. A rule
 * the bundled resolver cannot cover would degrade to `unresolved`, never throw.
 */

// A minimal C7 diagram with an unlabelled task — enough tree for the structural
// rules to walk without needing any Camunda-namespaced properties.
const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

const SECRET_TASK_XML = (engineVersion: string) => `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="${engineVersion}">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:serviceTask id="Task_1" name="Call API">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="call-api" />
        <zeebe:ioMapping>
          <zeebe:input source="{{secrets.MY_SECRET}}" target="token" />
        </zeebe:ioMapping>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
  </bpmn:process>
</bpmn:definitions>`;

async function parse(xml: string, packages: Record<string, unknown> = {}): Promise<unknown> {
    const createBpmnModdle = await loadBpmnModdle();
    const { rootElement } = await createBpmnModdle(packages).fromXML(xml);
    return rootElement;
}

async function lintAgainstTargetVersion(engineVersion: string) {
    const config = resolveLintConfig("implement", "c8", undefined, engineVersion);
    const definitions = await parse(SECRET_TASK_XML(engineVersion), config.moddleExtensions);
    return new BrowserLinter(config).run(definitions);
}

describe("BrowserLinter (jsdom browser-compat smoke)", () => {
    it("lints a parsed tree with the engine-aware default config without throwing", async () => {
        const definitions = await parse(XML);

        const event = await new BrowserLinter(C7_DEFAULT).run(definitions);

        expect(event.results).toBeTypeOf("object");
        expect(Array.isArray(event.unresolved)).toBe(true);
        // Every value in a lint result is a rule's report array.
        for (const reports of Object.values(event.results)) {
            expect(Array.isArray(reports)).toBe(true);
        }
    });

    it("flags a missing label with the default modeling preset", async () => {
        const definitions = await parse(XML);

        const { results } = await new BrowserLinter(C7_DEFAULT).run(definitions);

        // The task carries no name; bpmnlint:recommended's label-required is part of
        // the structural base, so it must report at least one finding.
        expect(results["label-required"]?.length ?? 0).toBeGreaterThan(0);
    });

    it("accepts the {{secrets.X}} format in a diagram that targets Camunda 8.7", async () => {
        const { results, unresolved } = await lintAgainstTargetVersion("8.7.0");

        expect(results["camunda-compat/secrets"] ?? []).toEqual([]);
        expect(unresolved).toEqual([]);
    });

    it("flags the {{secrets.X}} format as legacy in a diagram that targets Camunda 8.11", async () => {
        const { results } = await lintAgainstTargetVersion("8.11.0");

        expect(results["camunda-compat/secrets"]).toHaveLength(1);
    });
});
