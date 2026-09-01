/**
 * First-class domain value object for a BPMN XML document.
 *
 * Centralises all detection and manipulation operations so that raw
 * XML strings never need to be re-parsed at multiple call sites.
 * Instances are immutable: transformation methods return a new
 * `BpmnDocument` instead of mutating `this.xml`.
 */

import { detectEngine, Engine } from "@miragon/bpmn-modeler-types";

import { ExecutionPlatformNotDetectedError } from "./errors";

export class BpmnDocument {
    constructor(readonly xml: string) {}

    /**
     * Returns an empty BPMN diagram for the given engine and version — the
     * minimal structure bpmn-js needs to open and render a new diagram without
     * errors.
     */
    static empty(engine: Engine, version: string): BpmnDocument {
        if (engine === "c7") {
            return new BpmnDocument(`
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1d2hcmz" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.20.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="${version}">
  <bpmn:process id="Process_0gjrx3e" isExecutable="true" camunda:historyTimeToLive="180">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0gjrx3e">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`);
        }
        return new BpmnDocument(`
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1ksue5u" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.22.0" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="${version}">
  <bpmn:process id="Process_0vf1lkj" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0vf1lkj">
      <bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">
        <dc:Bounds x="179" y="159" width="36" height="36" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>
`);
    }

    /**
     * Returns `true` when the document holds no XML (new, unsaved file).
     */
    isEmpty(): boolean {
        return this.xml === "";
    }

    /**
     * Detects the Camunda execution platform from the XML.
     *
     * Delegates to the shared {@link detectEngine} helper for the spec-defined
     * `modeler:*` signals, then falls back to namespace declarations
     * (`xmlns:camunda` for C7, `xmlns:zeebe` for C8).
     *
     * @throws {ExecutionPlatformNotDetectedError} When no platform signal is found.
     */
    detectPlatform(): Engine {
        const detected = detectEngine(this.xml);
        if (detected) {
            return detected;
        }

        if (this.xml.match(/xmlns:camunda=".*"/)) {
            return "c7";
        } else if (this.xml.match(/xmlns:zeebe=".*"/)) {
            return "c8";
        } else {
            throw new ExecutionPlatformNotDetectedError();
        }
    }

    /**
     * Extracts the `modeler:executionPlatformVersion` value, or `undefined` if absent.
     */
    detectPlatformVersion(): string | undefined {
        const match = this.xml.match(/modeler:executionPlatformVersion="(\d+\.\d+\.\d+)"/);
        return match ? match[1] : undefined;
    }

    /**
     * Returns a new `BpmnDocument` with the `modeler:executionPlatformVersion` replaced.
     */
    withVersion(version: string): BpmnDocument {
        return new BpmnDocument(
            this.xml.replace(
                /modeler:executionPlatformVersion="\d+\.\d+\.\d+"/,
                `modeler:executionPlatformVersion="${version}"`,
            ),
        );
    }

    /**
     * Returns a new `BpmnDocument` with execution platform attributes (and an
     * optional `schema` namespace attribute) injected into the
     * `<bpmn:definitions>` opening tag. Throws when the XML has no such tag.
     */
    withExecutionPlatform(platform: string, version: string, schema?: string): BpmnDocument {
        const regex = /<bpmn:definitions[^>]*>/;
        const match = this.xml.match(regex);

        if (!match) {
            throw new Error("The BPMN file does not contain a `bpmn:definitions` tag.");
        }

        const schemaPrefix = schema ? `${schema} ` : "";
        const insert = `${schemaPrefix}modeler:executionPlatform="${platform}" modeler:executionPlatformVersion="${version}">`;

        // Split on whitespace tokens and strip the trailing ">" from the last token
        // before appending the new attributes.
        const tokens = match[0].split(" ");
        if (tokens[tokens.length - 1].endsWith(">")) {
            tokens[tokens.length - 1] = tokens[tokens.length - 1].slice(0, -1);
            tokens.push(insert);
        }
        return new BpmnDocument(this.xml.replace(regex, tokens.join(" ")));
    }

    /**
     * Extracts the process ID from the first `<bpmn:process>` element.
     *
     * @throws {Error} If no `<bpmn:process>` element with an `id` attribute is found.
     */
    extractProcessId(): string {
        const match = this.xml.match(/<bpmn:process\s+[^>]*id="([^"]+)"/);
        if (match) {
            return match[1];
        }
        throw new Error("No <bpmn:process> element with an id attribute found in the BPMN file.");
    }
}
