import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { createModeler } from "./createModeler";
import type { BpmnModelerHandle } from "./publicApi";
import type { PendingInputHandle } from "./surfaceHandle";
import { afterPaint, mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

const FEEL_JOB_TYPE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:serviceTask id="Task_1" name="A">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="=jobType" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

type Surface = BpmnModelerHandle & PendingInputHandle;

const surfaces: Surface[] = [];

async function openJobTypePopup(): Promise<Surface> {
    const { container, panel } = mountWithPanel();
    const surface = (await createModeler(container, {
        engine: "c8",
        linting: false,
        propertiesPanel: { parent: panel },
    })) as Surface;
    surfaces.push(surface);
    await surface.loadDiagram(FEEL_JOB_TYPE_XML);
    surface.selection.selectElementsByIds(["Task_1"]);

    const openButton = () =>
        panel.querySelector<HTMLElement>(
            '[data-entry-id="taskDefinitionType"] .bio-properties-panel-open-feel-popup',
        );
    await expect.poll(openButton).not.toBeNull();
    // The entry's group starts collapsed, so a pointer click would not reach the button.
    openButton()!.click();
    await expect.poll(popupEditor).not.toBeNull();
    return surface;
}

function popupEditor(): HTMLElement | null {
    return document.querySelector<HTMLElement>(".bio-properties-panel-feel-popup .cm-content");
}

async function typeIntoPopup(text: string): Promise<void> {
    await userEvent.click(popupEditor()!);
    await userEvent.keyboard(`{End}${text}`);
}

function jobType(surface: Surface): string | undefined {
    const task = surface.getService("elementRegistry").get("Task_1");
    return task?.businessObject.extensionElements?.values?.[0]?.type;
}

afterEach(async () => {
    // Input still waiting at destroy, in a pop-up draft or the debounce, lands on a torn-down canvas.
    surfaces.forEach((surface) => {
        surface.flushPendingInput();
        surface.getService("eventBus").fire("propertiesPanel.closePopup");
    });
    await afterPaint();
    surfaces.splice(0).forEach((surface) => surface.destroy());
    removeMounts();
});

describe("FEEL pop-up input", () => {
    it("reports an expression typed into the open pop-up as pending input", async () => {
        const surface = await openJobTypePopup();

        expect(surface.hasPendingInput()).toBe(false);
        await typeIntoPopup("Suffix");

        expect(surface.hasPendingInput()).toBe(true);
        expect(jobType(surface)).toBe("=jobType");
    });

    it("applies the expression typed into the open pop-up when the pending input is flushed", async () => {
        const surface = await openJobTypePopup();
        await typeIntoPopup("Suffix");

        surface.flushPendingInput();

        expect(surface.hasPendingInput()).toBe(false);
        expect(jobType(surface)).toBe("=jobTypeSuffix");
        expect(await surface.exportDiagram()).toContain('type="=jobTypeSuffix"');
        expect(popupEditor()).toBeNull();
    });

    it("leaves a pop-up nothing was typed into open on a flush", async () => {
        const surface = await openJobTypePopup();

        surface.flushPendingInput();

        expect(popupEditor()).not.toBeNull();
        expect(jobType(surface)).toBe("=jobType");
    });
});
