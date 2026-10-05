import type { Connection, Element, Shape } from "bpmn-js/lib/model/Types";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";

interface TransactionBoundariesService {
    readonly active: boolean;
    show(): void;
    hide(): void;
    toggle(): void;
}
interface ReplaceService {
    replaceElement(element: Shape, target: { type: string; isExpanded?: boolean }): Shape;
}
interface RenderedOverlay {
    element: Element;
    position: object;
    html: HTMLElement;
    htmlContainer?: HTMLElement;
}

const TRANSACTION_BOUNDARY_OVERLAY = "transaction-boundaries";

const FIXTURE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:camunda="http://camunda.org/schema/1.0/bpmn" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" xmlns:modeler="http://camunda.org/schema/modeler/1.0" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn" modeler:executionPlatform="Camunda Platform" modeler:executionPlatformVersion="7.24.0">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:exclusiveGateway id="Gateway_1" />
    <bpmn:userTask id="UserTask_1" />
    <bpmn:task id="Task_Plain" />
    <bpmn:serviceTask id="ServiceTask_1" camunda:asyncAfter="true" camunda:expression="\${true}" />
    <bpmn:receiveTask id="ReceiveTask_1" />
    <bpmn:endEvent id="EndEvent_1" />
    <bpmn:subProcess id="SubProcess_1">
      <bpmn:userTask id="UserTask_Inner" />
      <bpmn:intermediateCatchEvent id="Timer_Inner">
        <bpmn:timerEventDefinition id="TimerDefinition_1" />
      </bpmn:intermediateCatchEvent>
      <bpmn:sequenceFlow id="Flow_Inner" sourceRef="UserTask_Inner" targetRef="Timer_Inner" />
    </bpmn:subProcess>
    <bpmn:sequenceFlow id="Flow_Start" sourceRef="StartEvent_1" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_A" sourceRef="Gateway_1" targetRef="UserTask_1" />
    <bpmn:sequenceFlow id="Flow_B" sourceRef="Gateway_1" targetRef="Task_Plain" />
    <bpmn:sequenceFlow id="Flow_C" sourceRef="Task_Plain" targetRef="UserTask_1" />
    <bpmn:sequenceFlow id="Flow_D" sourceRef="UserTask_1" targetRef="ServiceTask_1" />
    <bpmn:sequenceFlow id="Flow_E" sourceRef="ServiceTask_1" targetRef="ReceiveTask_1" />
    <bpmn:sequenceFlow id="Flow_F" sourceRef="ReceiveTask_1" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1"><dc:Bounds x="152" y="182" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Gateway_1_di" bpmnElement="Gateway_1" isMarkerVisible="true"><dc:Bounds x="245" y="175" width="50" height="50" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UserTask_1_di" bpmnElement="UserTask_1"><dc:Bounds x="520" y="160" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_Plain_di" bpmnElement="Task_Plain"><dc:Bounds x="350" y="290" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ServiceTask_1_di" bpmnElement="ServiceTask_1"><dc:Bounds x="680" y="160" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ReceiveTask_1_di" bpmnElement="ReceiveTask_1"><dc:Bounds x="840" y="160" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1"><dc:Bounds x="1002" y="182" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_1_di" bpmnElement="SubProcess_1" isExpanded="true"><dc:Bounds x="350" y="440" width="350" height="200" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UserTask_Inner_di" bpmnElement="UserTask_Inner"><dc:Bounds x="400" y="500" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Timer_Inner_di" bpmnElement="Timer_Inner"><dc:Bounds x="582" y="522" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_Inner_di" bpmnElement="Flow_Inner"><di:waypoint x="500" y="540" /><di:waypoint x="582" y="540" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_Start_di" bpmnElement="Flow_Start"><di:waypoint x="188" y="200" /><di:waypoint x="245" y="200" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_A_di" bpmnElement="Flow_A"><di:waypoint x="295" y="200" /><di:waypoint x="520" y="200" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_B_di" bpmnElement="Flow_B"><di:waypoint x="270" y="225" /><di:waypoint x="270" y="330" /><di:waypoint x="350" y="330" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_C_di" bpmnElement="Flow_C"><di:waypoint x="450" y="330" /><di:waypoint x="570" y="330" /><di:waypoint x="570" y="240" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_D_di" bpmnElement="Flow_D"><di:waypoint x="620" y="200" /><di:waypoint x="680" y="200" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_E_di" bpmnElement="Flow_E"><di:waypoint x="780" y="200" /><di:waypoint x="840" y="200" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_F_di" bpmnElement="Flow_F"><di:waypoint x="940" y="200" /><di:waypoint x="1002" y="200" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

// UserTask_1 ×2 incoming, ServiceTask_1 after, ReceiveTask_1, UserTask_Inner, Timer_Inner.
const FIXTURE_MARK_COUNT = 6;

const handles: BpmnModeler[] = [];
const mountedNodes: HTMLElement[] = [];

afterEach(() => {
    handles.forEach((handle) => handle.destroy());
    handles.length = 0;
    mountedNodes.forEach((node) => node.remove());
    mountedNodes.length = 0;
});

async function openModeler(): Promise<BpmnModeler> {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    container.style.cssText = "position:absolute;width:1200px;height:800px";
    document.body.append(container, panel);
    mountedNodes.push(container, panel);
    const handle = await createModeler(container, {
        engine: "c7",
        propertiesPanel: { parent: panel },
    });
    handles.push(handle);
    return handle;
}

function renderedMarks(handle: BpmnModeler): string[] {
    const overlays = [handle.getService("overlays").get({ type: TRANSACTION_BOUNDARY_OVERLAY })]
        .flat()
        .filter((overlay) => overlay !== null) as unknown as RenderedOverlay[];
    return overlays
        .map((overlay) =>
            [
                overlay.element.id,
                JSON.stringify(overlay.position),
                overlay.html.outerHTML,
                overlay.htmlContainer?.style.display === "none" ? "hidden" : "visible",
            ].join("|"),
        )
        .sort();
}

function transactionBoundaries(handle: BpmnModeler): TransactionBoundariesService {
    return handle.getService<TransactionBoundariesService>("transactionBoundaries");
}

describe("transaction boundaries", () => {
    it("re-renders edits to the same marks as a full render", async () => {
        const handle = await openModeler();
        const reference = await openModeler();
        await handle.loadDiagram(FIXTURE_XML);

        const modeling = handle.getService("modeling");
        const commandStack = handle.getService("commandStack");
        const elementRegistry = handle.getService("elementRegistry");
        const bpmnReplace = handle.getService<ReplaceService>("bpmnReplace");
        const shape = (id: string) => elementRegistry.get(id) as Shape;
        const connection = (id: string) => elementRegistry.get(id) as Connection;

        const steps: [label: string, edit: () => unknown][] = [
            ["move", () => modeling.moveElements([shape("UserTask_1")], { x: 0, y: 30 })],
            [
                "async toggle",
                () =>
                    modeling.updateProperties(shape("Task_Plain"), { "camunda:asyncBefore": true }),
            ],
            ["flow delete", () => modeling.removeElements([connection("Flow_C")] as Element[])],
            [
                "reconnect",
                () => {
                    const receiveTask = shape("ReceiveTask_1");
                    modeling.reconnectEnd(connection("Flow_B"), receiveTask, {
                        x: receiveTask.x,
                        y: receiveTask.y + receiveTask.height / 2,
                    });
                },
            ],
            [
                "replace",
                () => bpmnReplace.replaceElement(shape("ServiceTask_1"), { type: "bpmn:UserTask" }),
            ],
            [
                "collapse",
                () =>
                    bpmnReplace.replaceElement(shape("SubProcess_1"), {
                        type: "bpmn:SubProcess",
                        isExpanded: false,
                    }),
            ],
        ];
        const editCount = steps.length;
        for (let undo = 1; undo <= editCount; undo++) {
            steps.push([`undo ${undo}`, () => commandStack.undo()]);
        }
        for (let redo = 1; redo <= editCount; redo++) {
            steps.push([`redo ${redo}`, () => commandStack.redo()]);
        }

        for (const [label, edit] of steps) {
            edit();
            await reference.loadDiagram(await handle.exportDiagram());
            expect(renderedMarks(handle), label).toEqual(renderedMarks(reference));
        }
    });

    it("keeps one overlay per mark when settings arrive repeatedly", async () => {
        const handle = await openModeler();
        await handle.loadDiagram(FIXTURE_XML);

        handle.setSettings({ showTransactionBoundaries: true });
        handle.setSettings({ colorTheme: "light" });
        handle.setSettings({ showTransactionBoundaries: true, alignToOrigin: false });

        expect(renderedMarks(handle)).toHaveLength(FIXTURE_MARK_COUNT);
    });

    // The patched show() is idempotent, so only call counts catch a regression npm consumers would see.
    it("toggles the service only when the setting changes its state", async () => {
        const handle = await openModeler();
        await handle.loadDiagram(FIXTURE_XML);
        const service = transactionBoundaries(handle);
        const show = vi.spyOn(service, "show");
        const hide = vi.spyOn(service, "hide");

        handle.setSettings({ showTransactionBoundaries: true });
        handle.setSettings({ colorTheme: "light" });
        expect(show).not.toHaveBeenCalled();
        expect(hide).not.toHaveBeenCalled();

        handle.setSettings({ showTransactionBoundaries: false });
        handle.setSettings({ showTransactionBoundaries: false });
        expect(hide).toHaveBeenCalledTimes(1);

        handle.setSettings({ showTransactionBoundaries: true });
        expect(show).toHaveBeenCalledTimes(1);
    });

    it("hides and shows the marks with the setting", async () => {
        const handle = await openModeler();
        await handle.loadDiagram(FIXTURE_XML);

        handle.setSettings({ showTransactionBoundaries: false });
        expect(renderedMarks(handle)).toHaveLength(0);

        handle.setSettings({ showTransactionBoundaries: true });
        expect(renderedMarks(handle)).toHaveLength(FIXTURE_MARK_COUNT);
    });

    it("keeps the service's show, hide and toggle working", async () => {
        const handle = await openModeler();
        await handle.loadDiagram(FIXTURE_XML);
        const service = transactionBoundaries(handle);

        service.show();
        service.show();
        expect(renderedMarks(handle)).toHaveLength(FIXTURE_MARK_COUNT);

        service.hide();
        expect(renderedMarks(handle)).toHaveLength(0);
        expect(service.active).toBe(false);

        service.toggle();
        expect(renderedMarks(handle)).toHaveLength(FIXTURE_MARK_COUNT);

        service.toggle();
        expect(renderedMarks(handle)).toHaveLength(0);
    });

    it("renders marks on a new diagram", async () => {
        const handle = await openModeler();
        await handle.newDiagram();
        const startEvent = handle
            .getService("elementRegistry")
            .find((element) => element.type === "bpmn:StartEvent") as Shape;

        handle
            .getService("modeling")
            .appendShape(
                startEvent,
                { type: "bpmn:UserTask" },
                { x: startEvent.x + 200, y: startEvent.y + startEvent.height / 2 },
                startEvent.parent as Shape,
            );

        expect(transactionBoundaries(handle).active).toBe(true);
        expect(renderedMarks(handle)).toHaveLength(1);
    });
});
