import { ENGINE_EXECUTION_PLATFORM, type Engine } from "@miragon/bpmn-modeler-types";

/**
 * bpmn-js ships an engine-neutral initial diagram, and camunda-bpmn-js ships no
 * platform-specific one. Hosts derive engine and mode availability from the
 * saved XML, so an engine-bound `newDiagram()` must stamp the execution-platform
 * metadata itself or the diagram reopens as neutral.
 */
export function initialDiagram(engine: Engine, executionPlatformVersion: string): string {
    return (
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" ' +
        'xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" ' +
        'xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" ' +
        'xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" ' +
        'xmlns:modeler="http://camunda.org/schema/modeler/1.0" ' +
        'targetNamespace="http://bpmn.io/schema/bpmn" ' +
        'id="Definitions_1" ' +
        `modeler:executionPlatform="${ENGINE_EXECUTION_PLATFORM[engine]}" ` +
        `modeler:executionPlatformVersion="${executionPlatformVersion}">` +
        '<bpmn:process id="Process_1" isExecutable="true">' +
        '<bpmn:startEvent id="StartEvent_1"/>' +
        "</bpmn:process>" +
        '<bpmndi:BPMNDiagram id="BPMNDiagram_1">' +
        '<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">' +
        '<bpmndi:BPMNShape id="_BPMNShape_StartEvent_2" bpmnElement="StartEvent_1">' +
        '<dc:Bounds height="36.0" width="36.0" x="173.0" y="102.0"/>' +
        "</bpmndi:BPMNShape>" +
        "</bpmndi:BPMNPlane>" +
        "</bpmndi:BPMNDiagram>" +
        "</bpmn:definitions>"
    );
}
