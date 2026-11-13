import { afterEach, describe, expect, it } from "vitest";

import { createModeler } from "./createModeler";
import { createDesigner } from "./design/createDesigner";
import type { BpmnDesigner } from "./design/designer";
import type { BpmnModeler } from "./modeler";
import { afterPaint, mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

const NS = `xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI"`;

const ORDER_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_0d1e2f3" name="Order fulfilment" isExecutable="true">
    <bpmn:startEvent id="Event_0k3j1vq" name="Order received">
      <bpmn:outgoing>Flow_0aaaaaa</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="Activity_1x9f2ab" name="Check stock">
      <bpmn:incoming>Flow_0aaaaaa</bpmn:incoming>
      <bpmn:outgoing>Flow_1m2n3b4</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:task id="Activity_0h7g6f5" name="Ship order">
      <bpmn:incoming>Flow_1m2n3b4</bpmn:incoming>
    </bpmn:task>
    <bpmn:sequenceFlow id="Flow_0aaaaaa" sourceRef="Event_0k3j1vq" targetRef="Activity_1x9f2ab" />
    <bpmn:sequenceFlow id="Flow_1m2n3b4" name="in stock" sourceRef="Activity_1x9f2ab" targetRef="Activity_0h7g6f5" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_0d1e2f3">
      <bpmndi:BPMNShape id="Event_0k3j1vq_di" bpmnElement="Event_0k3j1vq">
        <dc:Bounds x="152" y="102" width="36" height="36" />
        <bpmndi:BPMNLabel><dc:Bounds x="134" y="145" width="72" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_1x9f2ab_di" bpmnElement="Activity_1x9f2ab">
        <dc:Bounds x="240" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0h7g6f5_di" bpmnElement="Activity_0h7g6f5">
        <dc:Bounds x="420" y="80" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_0aaaaaa_di" bpmnElement="Flow_0aaaaaa">
        <di:waypoint x="188" y="120" /><di:waypoint x="240" y="120" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_1m2n3b4_di" bpmnElement="Flow_1m2n3b4">
        <di:waypoint x="340" y="120" /><di:waypoint x="420" y="120" />
        <bpmndi:BPMNLabel><dc:Bounds x="360" y="102" width="40" height="14" /></bpmndi:BPMNLabel>
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

/** Two tasks whose names say they should swap IDs. */
const SWAPPED_NAMES = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_A" name="B" />
    <bpmn:task id="Task_B" name="A" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A"><dc:Bounds x="100" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B"><dc:Bounds x="260" y="80" width="100" height="80" /></bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const POOL_AND_SUB_PROCESS = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${NS} id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:collaboration id="Collaboration_1">
    <bpmn:participant id="Participant_0p1q2r3" name="Order handling" processRef="Process_0s9t8u7" />
  </bpmn:collaboration>
  <bpmn:process id="Process_0s9t8u7" isExecutable="true">
    <bpmn:subProcess id="Activity_0v5w6x7" name="Review order">
      <bpmn:task id="Activity_0y1z2a3" name="Check items" />
    </bpmn:subProcess>
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Collaboration_1">
      <bpmndi:BPMNShape id="Participant_0p1q2r3_di" bpmnElement="Participant_0p1q2r3" isHorizontal="true">
        <dc:Bounds x="100" y="60" width="500" height="200" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Activity_0v5w6x7_di" bpmnElement="Activity_0v5w6x7" isExpanded="false">
        <dc:Bounds x="250" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
  <bpmndi:BPMNDiagram id="BPMNDiagram_2">
    <bpmndi:BPMNPlane id="BPMNPlane_2" bpmnElement="Activity_0v5w6x7">
      <bpmndi:BPMNShape id="Activity_0y1z2a3_di" bpmnElement="Activity_0y1z2a3">
        <dc:Bounds x="100" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

interface DiagramElement {
    id: string;
    businessObject: { id: string; $type: string; name?: string };
    label?: { id: string };
}

interface Services {
    elementRegistry: { get(id: string): DiagramElement | undefined; getAll(): DiagramElement[] };
    modeling: {
        updateLabel(element: DiagramElement, text: string): void;
        updateProperties(element: DiagramElement, properties: { id: string }): void;
    };
    bpmnReplace: {
        replaceElement(element: DiagramElement, target: { type: string }): DiagramElement;
    };
    commandStack: { undo(): void; redo(): void };
    selection: { select(element: DiagramElement): void };
}

const handles: { destroy(): void }[] = [];

afterEach(() => {
    handles.splice(0).forEach((handle) => handle.destroy());
    removeMounts();
    document.querySelectorAll(".eid-root").forEach((root) => root.remove());
});

async function openModeler(
    xml = ORDER_PROCESS,
    settings: Parameters<BpmnModeler["setSettings"]>[0] = {},
) {
    const { container, panel } = mountWithPanel(1200, 800);
    const handle = (await createModeler(container, {
        engine: "c7",
        propertiesPanel: { parent: panel },
        settings: {
            alignToOrigin: false,
            showTransactionBoundaries: false,
            colorTheme: "light",
            ...settings,
        },
    })) as BpmnModeler;
    handles.push(handle);
    await handle.loadDiagram(xml);
    await afterPaint();
    return { handle, container, panel, services: servicesOf(handle) };
}

function servicesOf(handle: { getService(name: never): unknown }): Services {
    const get = (name: string) => handle.getService(name as never);
    return {
        elementRegistry: get("elementRegistry") as Services["elementRegistry"],
        modeling: get("modeling") as Services["modeling"],
        bpmnReplace: get("bpmnReplace") as Services["bpmnReplace"],
        commandStack: get("commandStack") as Services["commandStack"],
        selection: get("selection") as Services["selection"],
    };
}

const panelRoot = () => document.querySelector<HTMLElement>(".eid-root");

const proposedIds = () =>
    [...panelRoot()!.querySelectorAll(".eid-row:not(.eid-plain) .eid-new")].map(
        (n) => n.textContent,
    );

async function apply(): Promise<void> {
    panelRoot()!.querySelector<HTMLButtonElement>(".eid-primary")!.click();
    await afterPaint();
}

// bpmn-js re-measures external labels on every property update, and its undo keeps the measured
// size, as when an ID is edited in the properties panel; the label boxes are not the rename's.
const withoutLabelBounds = (xml: string) =>
    xml.replace(/<bpmndi:BPMNLabel>[\s\S]*?<\/bpmndi:BPMNLabel>/g, "");

const ids = (services: Services) =>
    services.elementRegistry
        .getAll()
        .filter((element) => element.businessObject && element.id === element.businessObject.id)
        .map((element) => element.id)
        .sort();

describe("generating element IDs from names", () => {
    it("opens the review along the bottom of the canvas with every ID a name would change", async () => {
        const { handle, container } = await openModeler();

        expect(handle.openElementIdReview()).toEqual({ status: "opened" });
        await afterPaint();

        const root = panelRoot()!;
        expect(container.contains(root)).toBe(true);
        expect(proposedIds()).toEqual([
            "Process_OrderFulfilment",
            "ServiceTask_CheckStock",
            "Task_ShipOrder",
            "StartEvent_OrderReceived",
            "SequenceFlow_InStock",
        ]);
        expect(root.querySelector(".eid-summary")?.textContent).toBe("5 of 5 IDs will change");
    });

    it("renames the elements, their references, DI and labels, and leaves unnamed ones alone", async () => {
        const { handle, services } = await openModeler();
        handle.openElementIdReview();
        await afterPaint();

        await apply();

        const xml = await handle.exportDiagram();
        expect(xml).toContain('<bpmn:process id="Process_OrderFulfilment"');
        expect(xml).toContain(
            '<bpmn:sequenceFlow id="Flow_0aaaaaa" sourceRef="StartEvent_OrderReceived" targetRef="ServiceTask_CheckStock"',
        );
        expect(xml).toContain(
            '<bpmn:sequenceFlow id="SequenceFlow_InStock" name="in stock" sourceRef="ServiceTask_CheckStock" targetRef="Task_ShipOrder"',
        );
        expect(xml).toContain(
            '<bpmndi:BPMNShape id="ServiceTask_CheckStock_di" bpmnElement="ServiceTask_CheckStock">',
        );
        expect(xml).toContain(
            '<bpmndi:BPMNEdge id="SequenceFlow_InStock_di" bpmnElement="SequenceFlow_InStock">',
        );
        expect(xml).toContain(
            '<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_OrderFulfilment">',
        );
        expect(services.elementRegistry.get("StartEvent_OrderReceived")?.label?.id).toBe(
            "StartEvent_OrderReceived_label",
        );
        expect(panelRoot()).toBeNull();
    });

    it("puts everything back with one undo, and redoes it in one step", async () => {
        const { handle, services } = await openModeler();
        const before = ids(services);
        const xmlBefore = await handle.exportDiagram();
        handle.openElementIdReview();
        await afterPaint();
        await apply();
        const after = ids(services);

        services.commandStack.undo();
        expect(ids(services)).toEqual(before);
        expect(withoutLabelBounds(await handle.exportDiagram())).toBe(
            withoutLabelBounds(xmlBefore),
        );

        services.commandStack.redo();
        expect(ids(services)).toEqual(after);
    });

    it("keeps the ID of an unchecked row", async () => {
        const { handle, services } = await openModeler();
        handle.openElementIdReview();
        await afterPaint();

        panelRoot()!
            .querySelector<HTMLInputElement>('input[aria-label="Rename Ship order"]')!
            .click();
        await afterPaint();
        await apply();

        expect(services.elementRegistry.get("Activity_0h7g6f5")).toBeDefined();
        expect(services.elementRegistry.get("ServiceTask_CheckStock")).toBeDefined();
    });

    it("steers around the ID an element without a name keeps", async () => {
        const { handle, services } = await openModeler();
        services.modeling.updateProperties(services.elementRegistry.get("Flow_0aaaaaa")!, {
            id: "SequenceFlow_InStock",
        });
        handle.openElementIdReview();
        await afterPaint();

        await apply();

        expect(services.elementRegistry.get("SequenceFlow_InStock")?.businessObject.name).toBe(
            undefined,
        );
        expect(services.elementRegistry.get("SequenceFlow_InStock_2")?.businessObject.name).toBe(
            "in stock",
        );
    });

    it("swaps the IDs, and the DI IDs, of two elements whose names ask for it", async () => {
        const { handle, services } = await openModeler(SWAPPED_NAMES);
        handle.openElementIdReview();
        await afterPaint();

        await apply();

        expect(services.elementRegistry.get("Task_A")?.businessObject.name).toBe("A");
        expect(services.elementRegistry.get("Task_B")?.businessObject.name).toBe("B");
        const xml = await handle.exportDiagram();
        expect(xml).toContain('<bpmndi:BPMNShape id="Task_A_di" bpmnElement="Task_A">');
        expect(xml).toContain('<bpmndi:BPMNShape id="Task_B_di" bpmnElement="Task_B">');

        services.commandStack.undo();
        expect(services.elementRegistry.get("Task_A")?.businessObject.name).toBe("B");
    });

    it("renames a pool's process after the pool and a collapsed sub-process with its plane", async () => {
        const { handle, services } = await openModeler(POOL_AND_SUB_PROCESS);
        handle.openElementIdReview();
        await afterPaint();

        await apply();

        const xml = await handle.exportDiagram();
        expect(xml).toContain(
            '<bpmn:participant id="Participant_OrderHandling" name="Order handling" processRef="Process_OrderHandling"',
        );
        expect(xml).toContain('<bpmn:process id="Process_OrderHandling"');
        expect(xml).toContain(
            '<bpmndi:BPMNPlane id="BPMNPlane_2" bpmnElement="SubProcess_ReviewOrder">',
        );
        expect(services.elementRegistry.get("SubProcess_ReviewOrder_plane")).toBeDefined();
        expect(services.elementRegistry.get("Task_CheckItems")).toBeDefined();

        services.commandStack.undo();
        expect(await handle.exportDiagram()).toContain('processRef="Process_0s9t8u7"');
    });

    it("spells IDs in the style from the settings", async () => {
        const { handle, services } = await openModeler(ORDER_PROCESS, {
            elementIdStyle: "typeSuffix",
        });
        handle.openElementIdReview();
        await afterPaint();

        await apply();

        expect(services.elementRegistry.get("CheckStockTask")).toBeDefined();
        expect(services.elementRegistry.get("OrderFulfilmentProcess")).toBeDefined();
    });

    describe("IDs following names", () => {
        it("renames a random ID with its name, and one undo reverts both", async () => {
            const { handle, services } = await openModeler();
            handle.setElementIdSettings({ followName: true });
            const task = services.elementRegistry.get("Activity_1x9f2ab")!;

            services.modeling.updateLabel(task, "Pick items");

            expect(task.id).toBe("ServiceTask_PickItems");
            services.commandStack.undo();
            expect(task.id).toBe("Activity_1x9f2ab");
            expect(task.businessObject.name).toBe("Check stock");
        });

        it("leaves the ID alone while the setting is off", async () => {
            const { services } = await openModeler();
            const task = services.elementRegistry.get("Activity_1x9f2ab")!;

            services.modeling.updateLabel(task, "Pick items");

            expect(task.id).toBe("Activity_1x9f2ab");
        });

        it("follows the setting pushed through setSettings", async () => {
            const { handle, services } = await openModeler();
            handle.setSettings({ elementIdsFollowName: true, elementIdStyle: "snakeCase" });
            const task = services.elementRegistry.get("Activity_0h7g6f5")!;

            services.modeling.updateLabel(task, "Send parcel");

            expect(task.id).toBe("task_send_parcel");
        });

        it("renames a generated ID with the element's type, and one undo reverts both", async () => {
            const { handle, services } = await openModeler();
            handle.setElementIdSettings({ followName: true });
            services.modeling.updateProperties(services.elementRegistry.get("Activity_0h7g6f5")!, {
                id: "Task_ShipOrder",
            });

            services.bpmnReplace.replaceElement(services.elementRegistry.get("Task_ShipOrder")!, {
                type: "bpmn:ServiceTask",
            });

            expect(services.elementRegistry.get("Task_ShipOrder")).toBeUndefined();
            expect(
                services.elementRegistry.get("ServiceTask_ShipOrder")?.businessObject.$type,
            ).toBe("bpmn:ServiceTask");
            services.commandStack.undo();
            expect(services.elementRegistry.get("Task_ShipOrder")?.businessObject.$type).toBe(
                "bpmn:Task",
            );
        });
    });

    it("proposes the new type's ID after the element's type changed", async () => {
        const { handle, services } = await openModeler();
        services.modeling.updateProperties(services.elementRegistry.get("Activity_0h7g6f5")!, {
            id: "Task_ShipOrder",
        });
        services.bpmnReplace.replaceElement(services.elementRegistry.get("Task_ShipOrder")!, {
            type: "bpmn:ServiceTask",
        });

        handle.openElementIdReview();
        await afterPaint();

        expect(services.elementRegistry.get("Task_ShipOrder")?.businessObject.$type).toBe(
            "bpmn:ServiceTask",
        );
        expect(proposedIds()).toContain("ServiceTask_ShipOrder");
    });

    it("renames one element from the link under the ID field", async () => {
        const { panel, services } = await openModeler();
        services.selection.select(services.elementRegistry.get("Activity_1x9f2ab")!);
        await afterPaint();
        if (!panel.querySelector(".eid-id-actions")) {
            panel
                .querySelector<HTMLElement>(
                    '[data-group-id="group-general"] .bio-properties-panel-group-header',
                )
                ?.click();
            await afterPaint();
        }

        const generate = panel.querySelector<HTMLButtonElement>(".eid-id-actions .eid-link")!;
        expect(generate.title).toBe("Rename the ID to ServiceTask_CheckStock");
        generate.click();
        await afterPaint();

        expect(services.elementRegistry.get("ServiceTask_CheckStock")).toBeDefined();
        expect(panel.querySelector<HTMLButtonElement>(".eid-id-actions .eid-link")!.disabled).toBe(
            true,
        );
    });

    it("works on the engine-neutral designer too", async () => {
        const { container, panel } = mountWithPanel(1200, 800);
        const designer = (await createDesigner(container, {
            propertiesPanel: { parent: panel },
        })) as BpmnDesigner;
        handles.push(designer);
        await designer.loadDiagram(ORDER_PROCESS);
        await afterPaint();

        expect(designer.openElementIdReview()).toEqual({ status: "opened" });
        await afterPaint();
        await apply();

        expect(servicesOf(designer).elementRegistry.get("ServiceTask_CheckStock")).toBeDefined();
    });
});
