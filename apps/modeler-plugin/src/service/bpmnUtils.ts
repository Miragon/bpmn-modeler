/**
 * Pure utility functions and constants for BPMN file manipulation.
 *
 * These helpers have no dependencies on VS Code or any infrastructure class
 * and can therefore be tested in isolation.
 */

import { ExecutionPlatformNotDetectedError } from "../domain/errors";

/**
 * Injects `modeler:executionPlatform` and `modeler:executionPlatformVersion`
 * attributes — and optionally a namespace declaration — into the
 * `<bpmn:definitions>` opening tag of the given BPMN XML string.
 *
 * The function locates the `<bpmn:definitions ...>` opening tag, strips the
 * closing `>`, appends the new attributes, and re-closes the tag.
 *
 * @param bpmnFile The raw BPMN XML string to modify.
 * @param executionPlatform The execution platform name (e.g. `"Camunda Platform"`).
 * @param executionPlatformVersion The version string (e.g. `"7.20.0"`).
 * @param schema Optional namespace attribute to inject (e.g.
 *   `xmlns:camunda="http://camunda.org/schema/1.0/bpmn"`).
 * @returns A new BPMN XML string with the attributes injected.
 * @throws {Error} If the BPMN file does not contain a `<bpmn:definitions>` tag.
 */
export function addExecutionPlatform(
    bpmnFile: string,
    executionPlatform: string,
    executionPlatformVersion: string,
    schema?: string,
): string {
    const regex = /<bpmn:definitions[^>]*>/;
    const match = bpmnFile.match(regex);

    const insert = `${schema} modeler:executionPlatform="${executionPlatform}" modeler:executionPlatformVersion="${executionPlatformVersion}">`;

    if (match) {
        // Split on whitespace tokens and strip the trailing ">" from the last token
        // before appending the new attributes.
        const definition = match[0].split(" ");
        if (definition[definition.length - 1].endsWith(">")) {
            definition[definition.length - 1] = definition[
                definition.length - 1
            ].replace(">", "");
            definition.push(insert);
        }
        return bpmnFile.replace(regex, `${definition.join(" ")}`);
    } else {
        throw new Error("The BPMN file does not contain a `bpmn:definitions` tag.");
    }
}

/**
 * Detects the Camunda execution platform declared in the BPMN file.
 *
 * First checks for an explicit `modeler:executionPlatformVersion` attribute,
 * then falls back to detecting namespace declarations for `xmlns:camunda`
 * (Camunda 7) and `xmlns:zeebe` (Camunda 8).
 *
 * @param bpmnFile The raw BPMN XML string to inspect.
 * @returns `"c7"` for Camunda Platform 7, `"c8"` for Camunda Cloud 8.
 * @throws {Error} If the execution platform version is unsupported.
 * @throws {Error} If the execution platform cannot be detected.
 */
export function detectExecutionPlatform(bpmnFile: string): "c7" | "c8" {
    const regexExecutionPlatform = /modeler:executionPlatformVersion="([78])\.\d+\.\d+"/;
    const match = bpmnFile.match(regexExecutionPlatform);

    if (match) {
        switch (match[1]) {
            case "7":
                return "c7";
            case "8":
                return "c8";
            default:
                throw new Error(
                    `The execution platform version ${match[1]} is not supported.`,
                );
        }
    }

    if (bpmnFile.match(/xmlns:camunda=".*"/)) {
        return "c7";
    } else if (bpmnFile.match(/xmlns:zeebe=".*"/)) {
        return "c8";
    } else {
        throw new ExecutionPlatformNotDetectedError();
    }
}

/**
 * Extracts the process ID from the first `<bpmn:process>` element in the given BPMN XML.
 *
 * @param bpmnFile The raw BPMN XML string to inspect.
 * @returns The `id` attribute value of the first `<bpmn:process>` element.
 * @throws {Error} If no `<bpmn:process>` element with an `id` attribute is found.
 */
export function extractProcessId(bpmnFile: string): string {
    const regex = /<bpmn:process\s+[^>]*id="([^"]+)"/;
    const match = bpmnFile.match(regex);

    if (match) {
        return match[1];
    }

    throw new Error("No <bpmn:process> element with an id attribute found in the BPMN file.");
}

/** Empty Camunda 7 BPMN diagram used when opening a new blank `.bpmn` file. */
export const EMPTY_C7_BPMN_DIAGRAM = `
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" id="Definitions_1d2hcmz" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.20.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.20.0">
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
`;

/** Empty Camunda 8 BPMN diagram used when opening a new blank `.bpmn` file. */
export const EMPTY_C8_BPMN_DIAGRAM = `
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1ksue5u" targetNamespace="http://bpmn.io/schema/bpmn" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.22.0" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.4.0">
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
`;

/** Empty DMN diagram used when opening a new blank `.dmn` file. */
export const EMPTY_DMN_DIAGRAM = `
<?xml version="1.0" encoding="UTF-8"?>
<definitions xmlns="https://www.omg.org/spec/DMN/20191111/MODEL/" xmlns:dmndi="https://www.omg.org/spec/DMN/20191111/DMNDI/" xmlns:dc="http://www.omg.org/spec/DMN/20180521/DC/" id="Definitions_1y42u6n" name="DRD" namespace="http://camunda.org/schema/1.0/dmn" xmlns:modeler="http://camunda.org/schema/modeler/1.0" exporter="Camunda Modeler" exporterVersion="5.8.0" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.18.0">
  <decision id="Decision_16wqg49" name="Decision 1">
    <decisionTable id="DecisionTable_1wi1sbd">
      <input id="Input_1">
        <inputExpression id="InputExpression_1" typeRef="string">
          <text></text>
        </inputExpression>
      </input>
      <output id="Output_1" typeRef="string" />
    </decisionTable>
  </decision>
  <dmndi:DMNDI>
    <dmndi:DMNDiagram>
      <dmndi:DMNShape dmnElementRef="Decision_16wqg49">
        <dc:Bounds height="80" width="180" x="160" y="100" />
      </dmndi:DMNShape>
    </dmndi:DMNDiagram>
  </dmndi:DMNDI>
</definitions>
`;
