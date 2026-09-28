import "bpmn-js/dist/assets/diagram-js.css";

import Modeler from "bpmn-js/lib/Modeler";
import type EventBus from "diagram-js/lib/core/EventBus";
import type CommandStack from "diagram-js/lib/command/CommandStack";
import type ElementRegistry from "diagram-js/lib/core/ElementRegistry";
import type Overlays from "diagram-js/lib/features/overlays/Overlays";
import type Modeling from "bpmn-js/lib/features/modeling/Modeling";
import type { ModuleDeclaration } from "didi";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LintResults } from "@miragon/bpmn-modeler-types";

import { BrowserLinter } from "./browserLinter";
import { createLintModule } from "./index";
import type { LintConfigService } from "./LintConfigService";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_A" />
    <bpmn:task id="Task_B" />
    <bpmn:task id="Task_C" />
    <bpmn:subProcess id="Sub_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">
        <dc:Bounds x="300" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_C_di" bpmnElement="Task_C">
        <dc:Bounds x="500" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Sub_1_di" bpmnElement="Sub_1" isExpanded="false">
        <dc:Bounds x="700" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="BPMNDiagram_Sub_1">
    <bpmndi:BPMNPlane id="BPMNPlane_Sub_1" bpmnElement="Sub_1" />
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

function issue(id: string, message: string, category = "error") {
    return { id, message, category };
}

function results(taskBMessage = "Element is missing label/name"): LintResults {
    return {
        "label-required": [
            issue("Task_A", "Element is missing label/name"),
            issue("Task_B", taskBMessage),
            issue("Task_C", "Element is missing label/name"),
        ],
    };
}

let modeler: Modeler | undefined;
let container: HTMLElement | undefined;

function service<T>(name: string): T {
    return modeler!.get<T>(name);
}

function lintCompleted(): Promise<unknown> {
    return new Promise((resolve) =>
        service<EventBus>("eventBus").once("linting.completed", resolve),
    );
}

async function applyResults(lintResults: LintResults): Promise<void> {
    const completed = lintCompleted();
    service<LintConfigService>("bpmnLintConfig").applyLintResults(lintResults);
    await completed;
}

async function settle(action: () => unknown): Promise<void> {
    const completed = lintCompleted();
    action();
    await completed;
}

type ModelElement = Parameters<Modeling["removeElements"]>[0][number];

function elementOf(elementId: string): ModelElement {
    return service<ElementRegistry>("elementRegistry").get(elementId) as ModelElement;
}

function overlayNodeOf(elementId: string): HTMLElement | null {
    return container!.querySelector<HTMLElement>(
        `.djs-overlays[data-container-id="${elementId}"] .bjsl-overlay`,
    );
}

function lintOverlayCount(): number {
    return [service<Overlays>("overlays").get({ type: "linting" })].flat().length;
}

function countOverlayWork() {
    const overlays = service<Overlays>("overlays");
    const added = vi.spyOn(overlays, "add");
    const removed = vi.spyOn(overlays, "remove");
    return () => ({ added: added.mock.calls.length, removed: removed.mock.calls.length });
}

function mountModeler(tier: "external" | "in-page"): void {
    container = document.createElement("div");
    Object.assign(container.style, { position: "absolute", width: "1000px", height: "400px" });
    document.body.appendChild(container);
    modeler = new Modeler({
        container,
        additionalModules: [createLintModule({ tier, mode: "implement" }, {}) as ModuleDeclaration],
    });
}

afterEach(() => {
    modeler?.destroy();
    container?.remove();
    modeler = undefined;
    container = undefined;
    vi.restoreAllMocks();
});

describe("LintUpdateService with host-pushed results", () => {
    beforeEach(async () => {
        mountModeler("external");
        await modeler!.importXML(XML);
        await applyResults(results());
    });

    it("redraws only the overlay of the element whose issues changed", async () => {
        const [taskA, taskB, taskC] = ["Task_A", "Task_B", "Task_C"].map(overlayNodeOf);
        const overlayWork = countOverlayWork();

        await applyResults(results("Element is not connected"));

        expect(overlayWork()).toEqual({ added: 1, removed: 1 });
        expect(overlayNodeOf("Task_A")).toBe(taskA);
        expect(overlayNodeOf("Task_B")).not.toBe(taskB);
        expect(overlayNodeOf("Task_B")?.textContent).toContain("Element is not connected");
        expect(overlayNodeOf("Task_C")).toBe(taskC);
    });

    it("leaves every overlay untouched when the results are unchanged", async () => {
        const taskA = overlayNodeOf("Task_A");
        const overlayWork = countOverlayWork();

        await applyResults(results());
        await settle(() =>
            service<Modeling>("modeling").moveElements([elementOf("Task_A")], { x: 0, y: 10 }),
        );

        expect(overlayWork()).toEqual({ added: 0, removed: 0 });
        expect(overlayNodeOf("Task_A")).toBe(taskA);
    });

    it("removes the overlay of an element that no longer has issues", async () => {
        await applyResults({
            "label-required": [issue("Task_A", "Element is missing label/name")],
        });

        expect(overlayNodeOf("Task_A")).not.toBeNull();
        expect(overlayNodeOf("Task_B")).toBeNull();
        expect(lintOverlayCount()).toBe(1);
    });

    it("clears every overlay when linting is toggled off and redraws them when toggled on", async () => {
        const linting = service<{ toggle(active: boolean): void }>("linting");

        await settle(() => linting.toggle(false));
        expect(lintOverlayCount()).toBe(0);

        await settle(() => linting.toggle(true));
        expect(lintOverlayCount()).toBe(3);
    });

    it("clears every overlay on diagram.clear", () => {
        modeler!.clear();

        expect(lintOverlayCount()).toBe(0);
    });

    it("restores the overlay of a deleted element on undo", async () => {
        await settle(() => service<Modeling>("modeling").removeElements([elementOf("Task_B")]));
        expect(overlayNodeOf("Task_B")).toBeNull();

        await settle(() => service<CommandStack>("commandStack").undo());
        expect(overlayNodeOf("Task_B")).not.toBeNull();
    });

    it("replaces both the subprocess and its drill-down plane overlay when its issues change", async () => {
        await applyResults({ "label-required": [issue("Sub_1", "Element is missing label/name")] });
        expect(overlayNodeOf("Sub_1")).not.toBeNull();
        expect(overlayNodeOf("Sub_1_plane")).not.toBeNull();

        await applyResults({ "label-required": [issue("Sub_1", "Changed", "warn")] });

        expect(lintOverlayCount()).toBe(2);
        expect(overlayNodeOf("Sub_1")?.textContent).toContain("Changed");
        expect(overlayNodeOf("Sub_1_plane")?.textContent).toContain("Changed");
    });
});

describe("LintUpdateService with in-page linting", () => {
    it("lints once per import, after the import has finished", async () => {
        const lintRun = vi.spyOn(BrowserLinter.prototype, "run");
        mountModeler("in-page");

        const completed = lintCompleted();
        await modeler!.importXML(XML);
        expect(lintRun).not.toHaveBeenCalled();

        await completed;
        expect(lintRun).toHaveBeenCalledTimes(1);
    });
});
