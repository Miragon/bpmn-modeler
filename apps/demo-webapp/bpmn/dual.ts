import { createModeler } from "@miragon/bpmn-modeler-webview";
import { getActiveModel } from "../src";

/**
 * Two-instance regression proof for issue #1372: two independent modelers on one
 * page, each bound to its own canvas + panel host, neither using the legacy
 * `#js-canvas` / `#js-properties-panel` ids (that absence is the proof). No host,
 * no bootstrap — a bare {@link createModeler} per pane. Manual checks: pan/zoom/
 * selection and the properties panels are independent, Escape in panel A focuses
 * canvas A only, and each canvas paints its own lint/focus chrome.
 */

// A minimal Camunda 8 diagram so the second pane exercises the C8 engine path
// (the bundled demo models are all C7). Kept inline rather than in the registry
// because the registry only carries C7 models today.
const C8_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_dual_c8" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Cloud" modeler:executionPlatformVersion="8.5.0">
  <bpmn:process id="Process_dual_c8" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" name="Start (C8)">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:task id="Task_1" name="Do work">
      <bpmn:incoming>Flow_1</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_dual_c8">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="180" y="100" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="280" y="78" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <dc:waypoint x="216" y="118" />
        <dc:waypoint x="280" y="118" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/** Stands up one modeler bound to the given canvas + panel elements. */
async function mount(
    canvasId: string,
    panelId: string,
    engine: "c7" | "c8",
    xml: string,
): Promise<void> {
    const container = document.getElementById(canvasId);
    const propertiesPanelParent = document.getElementById(panelId);
    if (!container || !propertiesPanelParent) {
        throw new Error(`Missing #${canvasId} or #${panelId}`);
    }
    // No host wiring: the default no-op lintingHost keeps DI resolvable, and
    // handleGlobalEscape stays off so each instance only reacts to Escapes in
    // its own subtrees.
    const modeler = createModeler(container, { propertiesPanelParent });
    modeler.create(engine);
    await modeler.loadDiagram(xml);
}

// Left pane: the bundled C7 demo model. Right pane: the inline C8 diagram.
const c7Model = getActiveModel("bpmn");

void mount("canvas-a", "panel-a", "c7", c7Model.xml);
void mount("canvas-b", "panel-b", "c8", C8_XML);
