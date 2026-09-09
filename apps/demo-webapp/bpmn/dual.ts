import { createModeler } from "@miragon/bpmn-modeler";
import * as lintModule from "@miragon/bpmn-modeler/lint";
import { getActiveModel } from "../src";
import { MODELS } from "../src/registry";

/**
 * Two-instance regression proof: two independent modelers on one page, each
 * bound to its own canvas + panel host, neither using the legacy
 * `#js-canvas` / `#js-properties-panel` ids (that absence is the proof). No host,
 * no bootstrap — a bare {@link createModeler} per pane. Manual checks: pan/zoom/
 * selection and the properties panels are independent, Escape in panel A focuses
 * canvas A only, and each canvas paints its own lint/focus chrome.
 */

// A minimal Camunda 8 diagram so the second pane exercises the C8 engine path.
// Kept inline rather than in the registry because the bundled BPMN models are
// C7 (or engine-neutral), never C8.
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

/**
 * A per-pane light/dark toggle wired to that instance's `handle.setTheme(...)`.
 * This is the living regression check for per-instance theming: flipping one
 * pane must not touch the other (the `data-bpmn-theme` attribute is scoped to
 * each instance's container + panel, not the page).
 */
function mountThemeToggle(
    container: HTMLElement,
    modeler: { setTheme(t: "light" | "dark"): void },
): void {
    let dark = false;
    const button = document.createElement("button");
    button.textContent = "◐ theme";
    button.style.cssText =
        "position:absolute;top:8px;right:8px;z-index:10;padding:4px 8px;cursor:pointer";
    button.addEventListener("click", () => {
        dark = !dark;
        modeler.setTheme(dark ? "dark" : "light");
    });
    container.appendChild(button);
}

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
    // No host wiring: the lint stack is injected via the `/lint` subpath (#1407),
    // so each pane lints in-page with the engine-aware default config (the
    // multi-instance proof — both panes lint independently). handleGlobalEscape
    // stays off so each instance only reacts to Escapes in its own subtrees.
    // `createModeler` is async, so it is awaited before loading.
    const modeler = await createModeler(container, {
        engine,
        propertiesPanel: { parent: propertiesPanelParent },
        linting: { module: lintModule },
    });
    await modeler.loadDiagram(xml);
    mountThemeToggle(container, modeler);
}

// Left pane: a bundled C7 demo model (this pane proves the C7 engine path, so it
// skips the engine-neutral models); fall back to the active model if none is C7.
// Right pane: the inline C8 diagram.
const c7Model =
    MODELS.find((m) => m.type === "bpmn" && m.engine === "c7") ?? getActiveModel("bpmn");

void mount("canvas-a", "panel-a", c7Model.engine ?? "c7", c7Model.xml);
void mount("canvas-b", "panel-b", "c8", C8_XML);
