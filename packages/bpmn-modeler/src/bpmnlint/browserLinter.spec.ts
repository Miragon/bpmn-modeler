import { describe, expect, it } from "vitest";

import { BrowserLinter } from "./browserLinter";

type ModdleFactory = (ext?: Record<string, unknown>) => {
    fromXML: (x: string) => Promise<{ rootElement: unknown }>;
};

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

async function parse(xml: string): Promise<unknown> {
    // bpmn-moddle's default export is the factory (called, not `new`); its ESM
    // interop exposes it under `default` or `BpmnModdle`, mirroring NodeBpmnLinter.
    const mod = (await import("bpmn-moddle")) as unknown as {
        default?: ModdleFactory;
        BpmnModdle?: ModdleFactory;
    };
    const factory = mod.default ?? mod.BpmnModdle;
    if (!factory) {
        throw new Error("bpmn-moddle exposed no factory");
    }
    const { rootElement } = await factory().fromXML(xml);
    return rootElement;
}

describe("BrowserLinter (jsdom browser-compat smoke)", () => {
    it("lints a parsed tree with the engine-aware default config without throwing", async () => {
        const definitions = await parse(XML);

        const event = await new BrowserLinter("c7").run(definitions);

        expect(event.results).toBeTypeOf("object");
        expect(Array.isArray(event.unresolved)).toBe(true);
        // Every value in a lint result is a rule's report array.
        for (const reports of Object.values(event.results)) {
            expect(Array.isArray(reports)).toBe(true);
        }
    });

    it("flags a missing label with the default modeling preset", async () => {
        const definitions = await parse(XML);

        const { results } = await new BrowserLinter("c7").run(definitions);

        // The task carries no name; bpmnlint:recommended's label-required is part of
        // the structural base, so it must report at least one finding.
        expect(results["label-required"]?.length ?? 0).toBeGreaterThan(0);
    });
});
