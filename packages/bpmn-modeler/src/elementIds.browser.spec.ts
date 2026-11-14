import { afterEach, describe, expect, it } from "vitest";

import { createElementIdConvention } from "./bpmnlint";
import { createModeler } from "./createModeler";
import { createDesigner } from "./design/createDesigner";
import type { BpmnDesigner } from "./design/designer";
import type { BpmnModeler } from "./modeler";
import type { ElementIdConvention } from "./publicApi";
import { afterPaint, mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

const miragon = createElementIdConvention();

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
    <bpmn:task id="task_a" name="B" />
    <bpmn:task id="task_b" name="A" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="task_a_di" bpmnElement="task_a"><dc:Bounds x="100" y="80" width="100" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="task_b_di" bpmnElement="task_b"><dc:Bounds x="260" y="80" width="100" height="80" /></bpmndi:BPMNShape>
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
});

async function openModeler(
    xml = ORDER_PROCESS,
    {
        settings = {},
        convention = miragon,
    }: {
        settings?: Parameters<BpmnModeler["setSettings"]>[0];
        convention?: ElementIdConvention | null;
    } = {},
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
    if (convention) {
        handle.setElementIdSettings({ convention });
    }
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

type ElementIdHandle = Pick<BpmnModeler, "proposeElementIds" | "renameElementIds">;

const proposedIds = (handle: ElementIdHandle) =>
    handle.proposeElementIds().rows.map((row) => row.newId);

/** Renames what a review renames as it starts, with process IDs unchecked unless `processes`. */
const renameAll = (handle: ElementIdHandle, { processes = false } = {}) =>
    handle.renameElementIds(processes ? [] : handle.proposeElementIds().unchecked);

async function showGeneralGroup(panel: HTMLElement): Promise<void> {
    if (!panel.querySelector(".eid-id-actions")) {
        panel
            .querySelector<HTMLElement>(
                '[data-group-id="group-general"] .bio-properties-panel-group-header',
            )
            ?.click();
        await afterPaint();
    }
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
    it("lists the rows for a host's panel, with process IDs unchecked", async () => {
        const { handle } = await openModeler();

        const { rows, unchecked } = handle.proposeElementIds();

        expect(unchecked).toEqual(["Process_0d1e2f3"]);
        expect(rows.map((row) => [row.id, row.status, row.newId])).toEqual([
            ["Process_0d1e2f3", "unchecked", "orderFulfilment"],
            ["Event_0k3j1vq", "rename", "startEvent_orderReceived"],
            ["Activity_1x9f2ab", "rename", "serviceTask_checkStock"],
            ["Activity_0h7g6f5", "rename", "task_shipOrder"],
            ["Flow_0aaaaaa", "skipped", undefined],
            ["Flow_1m2n3b4", "rename", "flow_inStock"],
        ]);
    });

    it("renames the elements, their references, DI and labels, and leaves unnamed ones and the process alone", async () => {
        const { handle, services } = await openModeler();

        expect(renameAll(handle)).toBe(4);

        const xml = await handle.exportDiagram();
        expect(xml).toContain('<bpmn:process id="Process_0d1e2f3"');
        expect(xml).toContain(
            '<bpmn:sequenceFlow id="Flow_0aaaaaa" sourceRef="startEvent_orderReceived" targetRef="serviceTask_checkStock"',
        );
        expect(xml).toContain(
            '<bpmn:sequenceFlow id="flow_inStock" name="in stock" sourceRef="serviceTask_checkStock" targetRef="task_shipOrder"',
        );
        expect(xml).toContain(
            '<bpmndi:BPMNShape id="serviceTask_checkStock_di" bpmnElement="serviceTask_checkStock">',
        );
        expect(xml).toContain('<bpmndi:BPMNEdge id="flow_inStock_di" bpmnElement="flow_inStock">');
        expect(services.elementRegistry.get("startEvent_orderReceived")?.label?.id).toBe(
            "startEvent_orderReceived_label",
        );
    });

    it("renames the process and its plane once it is checked", async () => {
        const { handle } = await openModeler();

        renameAll(handle, { processes: true });

        const xml = await handle.exportDiagram();
        expect(xml).toContain('<bpmn:process id="orderFulfilment"');
        expect(xml).toContain('<bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="orderFulfilment">');
    });

    it("steers around the ID an element without a name keeps", async () => {
        const { handle, services } = await openModeler();
        services.modeling.updateProperties(services.elementRegistry.get("Flow_0aaaaaa")!, {
            id: "flow_inStock",
        });

        renameAll(handle);

        expect(services.elementRegistry.get("flow_inStock")?.businessObject.name).toBe(undefined);
        expect(services.elementRegistry.get("flow_inStock2")?.businessObject.name).toBe("in stock");
    });

    it("puts everything back with one undo, and redoes it in one step", async () => {
        const { handle, services } = await openModeler();
        const before = ids(services);
        const xmlBefore = await handle.exportDiagram();
        renameAll(handle);
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

        expect(handle.renameElementIds(["Process_0d1e2f3", "Activity_0h7g6f5"])).toBe(3);

        expect(ids(services)).toEqual([
            "Activity_0h7g6f5",
            "Flow_0aaaaaa",
            "Process_0d1e2f3",
            "flow_inStock",
            "serviceTask_checkStock",
            "startEvent_orderReceived",
        ]);
    });

    it("swaps the IDs, and the DI IDs, of two elements whose names ask for it", async () => {
        const { handle, services } = await openModeler(SWAPPED_NAMES);

        renameAll(handle);

        expect(services.elementRegistry.get("task_a")?.businessObject.name).toBe("A");
        expect(services.elementRegistry.get("task_b")?.businessObject.name).toBe("B");
        const xml = await handle.exportDiagram();
        expect(xml).toContain('<bpmndi:BPMNShape id="task_a_di" bpmnElement="task_a">');
        expect(xml).toContain('<bpmndi:BPMNShape id="task_b_di" bpmnElement="task_b">');

        services.commandStack.undo();
        expect(services.elementRegistry.get("task_a")?.businessObject.name).toBe("B");
    });

    it("renames a pool's process after the pool and a collapsed sub-process with its plane", async () => {
        const { handle, services } = await openModeler(POOL_AND_SUB_PROCESS);

        renameAll(handle, { processes: true });

        const xml = await handle.exportDiagram();
        expect(xml).toContain(
            '<bpmn:participant id="participant_orderHandling" name="Order handling" processRef="orderHandling"',
        );
        expect(xml).toContain('<bpmn:process id="orderHandling"');
        expect(xml).toContain(
            '<bpmndi:BPMNPlane id="BPMNPlane_2" bpmnElement="subProcess_reviewOrder">',
        );
        expect(services.elementRegistry.get("subProcess_reviewOrder_plane")).toBeDefined();
        expect(services.elementRegistry.get("task_checkItems")).toBeDefined();

        services.commandStack.undo();
        expect(await handle.exportDiagram()).toContain('processRef="Process_0s9t8u7"');
    });

    it("spells IDs as a configured lint rule asks", async () => {
        const { handle, services } = await openModeler(ORDER_PROCESS, {
            convention: createElementIdConvention({ case: "snake_case" }),
        });

        renameAll(handle);

        expect(services.elementRegistry.get("serviceTask_check_stock")).toBeDefined();
        expect(services.elementRegistry.get("task_ship_order")).toBeDefined();
    });

    it("spells IDs after the element's own type until a convention is handed in", async () => {
        const { handle } = await openModeler(ORDER_PROCESS, { convention: null });

        expect(proposedIds(handle)).toContain("sequenceFlow_inStock");
    });

    describe("IDs following names", () => {
        it("renames a random ID with its name, and one undo reverts both", async () => {
            const { handle, services } = await openModeler();
            handle.setElementIdSettings({ followName: true });
            const task = services.elementRegistry.get("Activity_1x9f2ab")!;

            services.modeling.updateLabel(task, "Pick items");

            expect(task.id).toBe("serviceTask_pickItems");
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
            handle.setSettings({ elementIdsFollowName: true });
            const task = services.elementRegistry.get("Activity_0h7g6f5")!;

            services.modeling.updateLabel(task, "Send parcel");

            expect(task.id).toBe("task_sendParcel");
        });

        it("renames a generated ID with the element's type, and one undo reverts both", async () => {
            const { handle, services } = await openModeler();
            handle.setElementIdSettings({ followName: true });
            services.modeling.updateProperties(services.elementRegistry.get("Activity_0h7g6f5")!, {
                id: "task_shipOrder",
            });

            services.bpmnReplace.replaceElement(services.elementRegistry.get("task_shipOrder")!, {
                type: "bpmn:ServiceTask",
            });

            expect(services.elementRegistry.get("task_shipOrder")).toBeUndefined();
            expect(
                services.elementRegistry.get("serviceTask_shipOrder")?.businessObject.$type,
            ).toBe("bpmn:ServiceTask");
            services.commandStack.undo();
            expect(services.elementRegistry.get("task_shipOrder")?.businessObject.$type).toBe(
                "bpmn:Task",
            );
        });
    });

    it("proposes the new type's ID after the element's type changed", async () => {
        const { handle, services } = await openModeler();
        services.modeling.updateProperties(services.elementRegistry.get("Activity_0h7g6f5")!, {
            id: "task_shipOrder",
        });
        services.bpmnReplace.replaceElement(services.elementRegistry.get("task_shipOrder")!, {
            type: "bpmn:ServiceTask",
        });

        expect(services.elementRegistry.get("task_shipOrder")?.businessObject.$type).toBe(
            "bpmn:ServiceTask",
        );
        expect(proposedIds(handle)).toContain("serviceTask_shipOrder");
    });

    describe("the links under the ID field", () => {
        it("renames one element, and offers no review where the host has none", async () => {
            const { panel, services } = await openModeler();
            services.selection.select(services.elementRegistry.get("Activity_1x9f2ab")!);
            await afterPaint();
            await showGeneralGroup(panel);

            const links = panel.querySelectorAll<HTMLButtonElement>(".eid-id-actions .eid-link");
            expect([...links].map((link) => link.textContent)).toEqual(["Generate from name"]);
            expect(links[0]!.title).toBe("Rename the ID to serviceTask_checkStock");
            links[0]!.click();
            await afterPaint();

            expect(services.elementRegistry.get("serviceTask_checkStock")).toBeDefined();
            expect(
                panel.querySelector<HTMLButtonElement>(".eid-id-actions .eid-link")!.disabled,
            ).toBe(true);
        });

        it("opens the host's own review of the whole diagram", async () => {
            const { handle, panel, services } = await openModeler();
            let opened = 0;
            handle.setElementIdSettings({ openReview: () => opened++ });
            services.selection.select(services.elementRegistry.get("Activity_1x9f2ab")!);
            await afterPaint();
            await showGeneralGroup(panel);

            const review = panel.querySelectorAll<HTMLButtonElement>(
                ".eid-id-actions .eid-link",
            )[1]!;
            expect(review.textContent).toBe("Review all IDs…");
            review.click();
            await afterPaint();

            expect(opened).toBe(1);
        });
    });

    describe("the engine-neutral designer", () => {
        it("lists and renames as the modeler does", async () => {
            const { container, panel } = mountWithPanel(1200, 800);
            const designer = (await createDesigner(container, {
                propertiesPanel: { parent: panel },
                elementIdSettings: { convention: miragon },
            })) as BpmnDesigner;
            handles.push(designer);
            await designer.loadDiagram(ORDER_PROCESS);

            expect(designer.proposeElementIds(["Activity_1x9f2ab"]).rows[2]?.status).toBe(
                "unchecked",
            );
            expect(designer.renameElementIds(["Process_0d1e2f3"])).toBe(4);
            expect(
                servicesOf(designer).elementRegistry.get("serviceTask_checkStock"),
            ).toBeDefined();
        });

        it("takes the element ID settings it is created with", async () => {
            const { container, panel } = mountWithPanel(1200, 800);
            const designer = (await createDesigner(container, {
                propertiesPanel: { parent: panel },
                elementIdSettings: {
                    convention: createElementIdConvention({ case: "snake_case" }),
                },
            })) as BpmnDesigner;
            handles.push(designer);
            await designer.loadDiagram(ORDER_PROCESS);

            expect(proposedIds(designer)).toContain("serviceTask_check_stock");
        });
    });
});
