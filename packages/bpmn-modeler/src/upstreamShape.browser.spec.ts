import Modeler from "bpmn-js/lib/Modeler";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getDirectEditingContent } from "@miragon/bpmn-modeler-clipboard";
import { getPopupMenuContext } from "@miragon/bpmn-modeler-append-menu";

/**
 * Pins the private upstream shapes the typed adapters (WP1) reach into against
 * the *installed* bpmn-js / diagram-js — so a renovate bump that moves
 * `directEditing._textbox.content` or `popupMenu._getContext` fails here loudly
 * rather than silently no-op'ing in production. Runs against real Chromium
 * because direct editing and the popup menu need layout and focus jsdom lacks.
 */

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" name="A" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="200" y="200" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

let modeler: Modeler | undefined;
let container: HTMLElement | undefined;

beforeEach(async () => {
    container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    container.style.position = "absolute";
    document.body.appendChild(container);
    modeler = new Modeler({ container });
    await modeler.importXML(XML);
});

afterEach(() => {
    modeler?.destroy();
    container?.remove();
    modeler = undefined;
    container = undefined;
});

function task(): unknown {
    return modeler!.get<{ get(id: string): unknown }>("elementRegistry").get("Task_1");
}

describe("getDirectEditingContent (diagram-js-direct-editing shape pin)", () => {
    it("returns the contenteditable overlay for the active editing session", () => {
        const directEditing = modeler!.get<{ activate(element: unknown): void }>("directEditing");
        directEditing.activate(task());

        const content = getDirectEditingContent(directEditing);

        expect(content).toBeInstanceOf(HTMLElement);
        expect(content.isContentEditable).toBe(true);
    });

    it.each([
        ["no textbox", {}],
        ["empty textbox", { _textbox: {} }],
    ])("throws when the shape is unexpected (%s)", (_label, value) => {
        expect(() => getDirectEditingContent(value)).toThrow(/diagram-js-direct-editing/);
    });
});

describe("getPopupMenuContext (diagram-js popupMenu shape pin)", () => {
    it("collects entries for the bpmn-replace provider", () => {
        const popupMenu = modeler!.get("popupMenu");

        const context = getPopupMenuContext(popupMenu, task(), "bpmn-replace");

        expect(Object.keys(context.entries).length).toBeGreaterThan(0);
        expect(typeof context.headerEntries).toBe("object");
        expect(context.empty).toBe(false);
    });

    it("throws when popupMenu carries no _getContext", () => {
        expect(() => getPopupMenuContext({}, task(), "bpmn-replace")).toThrow(
            /diagram-js popupMenu/,
        );
    });
});
