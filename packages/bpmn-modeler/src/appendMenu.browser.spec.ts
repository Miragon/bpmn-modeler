import type { Shape } from "bpmn-js/lib/model/Types";
import { isExpanded } from "bpmn-js/lib/util/DiUtil";
import {
    ALL_EVENTS,
    DATA_OBJECTS,
    GATEWAY,
    PARTICIPANT,
    SUBPROCESS,
    TASK,
} from "bpmn-js-create-append-anything";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { PLAIN_ENTRY_ACTION_BY_BPMN_TYPE } from "@miragon/bpmn-modeler-append-menu";

import { createModeler } from "./createModeler";
import { createDesigner } from "./design/createDesigner";
import type { BpmnDesigner } from "./design/designer";
import type { BpmnModeler } from "./modeler";
import { afterPaint } from "./__fixtures__/surfaceMount";

interface PopupMenuService {
    open(target: unknown, providerId: string, position: { x: number; y: number }): void;
    close(): void;
}

interface ElementTemplatesService {
    createElement(template: object): Shape;
}

type ModelerOptions = Pick<
    Parameters<typeof createModeler>[1],
    "engine" | "locale" | "settings" | "elementTemplates"
>;

const CALL_ACTIVITY_FAVOURITE = { favouriteBpmnElements: ["bpmn:CallActivity"] };

const UPSTREAM_OPTIONS = [
    ...TASK,
    ...GATEWAY,
    ...SUBPROCESS,
    ...ALL_EVENTS,
    ...DATA_OBJECTS,
    ...PARTICIPANT,
];

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:task id="Task_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="200" y="200" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

const TASK_OR_USER_TASK_TEMPLATE = {
    $schema: "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json",
    id: "task-or-user-task",
    name: "Task or user task",
    appliesTo: ["bpmn:Task", "bpmn:UserTask"],
    properties: [],
};

const ZEEBE_TASK_TEMPLATE = {
    $schema: "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
    id: "zeebe-task",
    name: "Zeebe task",
    appliesTo: ["bpmn:Task"],
    properties: [],
};

const handles: (BpmnModeler | BpmnDesigner)[] = [];
const mountedNodes: HTMLElement[] = [];

function teardown(): void {
    handles.splice(0).forEach((handle) => handle.destroy());
    mountedNodes.splice(0).forEach((node) => node.remove());
    document.querySelectorAll(".am-overlay-root").forEach((root) => root.remove());
}

async function openModeler(options: ModelerOptions): Promise<BpmnModeler> {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    container.style.cssText = "position:absolute;width:1200px;height:800px";
    document.body.append(container, panel);
    mountedNodes.push(container, panel);
    const handle = await createModeler(container, {
        propertiesPanel: { parent: panel },
        ...options,
    });
    handles.push(handle);
    await handle.loadDiagram(XML);
    await afterPaint();
    return handle;
}

async function openAppendMenu(options: Partial<ModelerOptions>): Promise<BpmnModeler> {
    const handle = await openModeler({ engine: "c7", ...options });
    openAppendMenuOn(handle);
    return handle;
}

async function openDesignerAppendMenu(): Promise<void> {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    container.style.cssText = "position:absolute;width:1200px;height:800px";
    document.body.append(container, panel);
    mountedNodes.push(container, panel);
    const designer = await createDesigner(container, {
        propertiesPanel: { parent: panel },
        locale: "en",
        ...CALL_ACTIVITY_FAVOURITE,
    });
    handles.push(designer);
    await designer.loadDiagram(XML);
    await afterPaint();
    openAppendMenuOn(designer);
}

function openAppendMenuOn(handle: BpmnModeler | BpmnDesigner): void {
    const task = handle.getService<{ get(id: string): Shape }>("elementRegistry").get("Task_1");
    handle.getService<PopupMenuService>("popupMenu").open(task, "bpmn-append", { x: 320, y: 200 });
}

function navKeys(selector: string): (string | null)[] {
    return Array.from(document.querySelectorAll(`${selector} .am-bpmn-button`), (button) =>
        button.getAttribute("data-nav-key"),
    );
}

function click(selector: string): void {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) {
        throw new Error(`No element matches ${selector}`);
    }
    element.click();
}

describe("append menu entry catalog", () => {
    let c8Templates: ElementTemplatesService;

    beforeAll(async () => {
        c8Templates = (await openModeler({ engine: "c8" })).getService("elementTemplates");
    });

    afterAll(teardown);

    it.each(Object.entries(PLAIN_ENTRY_ACTION_BY_BPMN_TYPE))(
        "maps %s to the entry showing what the C8 template factory creates",
        (bpmnType, action) => {
            const { target } = UPSTREAM_OPTIONS.find(({ actionName }) => actionName === action)!;
            const created = c8Templates.createElement({
                id: "probe",
                name: "Probe",
                appliesTo: [bpmnType],
                properties: [],
            });

            expect(target.type).toBe(bpmnType);
            expect(target.eventDefinitionType).toBeUndefined();
            expect(target.triggeredByEvent).toBeUndefined();
            expect(isExpanded(created)).toBe(target.isExpanded ?? isExpanded(created));
        },
    );

    it("covers every type upstream offers a plain entry for", () => {
        const plainUpstreamTypes = UPSTREAM_OPTIONS.filter(
            ({ target }) => !target.eventDefinitionType && !target.triggeredByEvent,
        ).map(({ target }) => target.type);

        expect(new Set(plainUpstreamTypes)).toEqual(
            new Set(Object.keys(PLAIN_ENTRY_ACTION_BY_BPMN_TYPE)),
        );
    });
});

describe("append menu", () => {
    afterEach(teardown);

    it("pins favourites by BPMN type in a translated UI", async () => {
        await openAppendMenu({
            locale: "de",
            settings: {
                favouriteBpmnElements: [
                    "bpmn:BusinessRuleTask",
                    "bpmn:IntermediateThrowEvent",
                    "bpmn:SubProcess",
                    "bpmn:UserTask",
                ],
            },
        });

        expect(navKeys(".am-bpmn-group--favourites")).toEqual([
            "fav:append-rule-task",
            "fav:append-none-intermediate-throwing",
            "fav:append-expanded-subprocess",
            "fav:append-user-task",
        ]);
        expect(
            document.querySelector('[data-nav-key="fav:append-rule-task"]')?.getAttribute("title"),
        ).toBe("Regel Aufgabe");
    });

    it("offers a multi-type template only the types it applies to and creates the pick", async () => {
        const handle = await openAppendMenu({ elementTemplates: [TASK_OR_USER_TASK_TEMPLATE] });

        click(".am-template-card");

        await expect
            .poll(() => navKeys(".am-bpmn-group"))
            .toEqual(["grp:tasks:append-task", "grp:tasks:append-user-task"]);

        click('[data-nav-key="grp:tasks:append-user-task"]');

        const created = handle
            .getService<{ filter(predicate: (shape: Shape) => boolean): Shape[] }>(
                "elementRegistry",
            )
            .filter((shape) => shape.id !== "Task_1" && shape.type === "bpmn:UserTask");
        expect(created).toHaveLength(1);
        expect(created[0].businessObject.get("camunda:modelerTemplate")).toBe(
            TASK_OR_USER_TASK_TEMPLATE.id,
        );
    });

    it.each([
        [
            "C7",
            () => openAppendMenu({ engine: "c7", locale: "en", settings: CALL_ACTIVITY_FAVOURITE }),
        ],
        [
            "C8",
            () => openAppendMenu({ engine: "c8", locale: "en", settings: CALL_ACTIVITY_FAVOURITE }),
        ],
        ["Design", openDesignerAppendMenu],
    ])(
        "finds a %s element by its keyword and previews the description the arrow keys reach",
        async (_surface, openMenu) => {
            await openMenu();

            await userEvent.type(
                document.querySelector<HTMLInputElement>(".am-search-input")!,
                "child process",
            );
            await expect
                .poll(() => navKeys(".am-panel"))
                .toEqual(["fav:append-call-activity", "grp:subprocess:append-call-activity"]);

            await userEvent.keyboard("{ArrowDown}");

            const callActivity = document.querySelector<HTMLElement>(
                '[data-nav-key="grp:subprocess:append-call-activity"]',
            )!;
            await expect.element(callActivity).toHaveClass("am-bpmn-button--focused");
            const descriptionCard = () =>
                document.getElementById(callActivity.getAttribute("aria-describedby") ?? "");
            await expect
                .poll(() => descriptionCard()?.textContent)
                .toContain("Calls another process as a reusable subprocess");
            await expect.element(descriptionCard()!).toBeVisible();
        },
    );

    it("leaves the collapsed palette collapsed while the mouse rests on a description", async () => {
        await openAppendMenu({
            engine: "c8",
            locale: "en",
            elementTemplates: [ZEEBE_TASK_TEMPLATE],
        });
        await userEvent.type(
            document.querySelector<HTMLInputElement>(".am-search-input")!,
            "child process",
        );
        await expect
            .poll(() => document.querySelector(".am-hover-card-name")?.textContent)
            .toBe("Call activity");

        await userEvent.hover(document.querySelector<HTMLElement>(".am-hover-card")!);
        await afterPaint();

        expect(document.querySelector(".am-palette-panel")).not.toHaveClass(
            "am-palette-panel--expanded",
        );
    });

    it("places the description card beside the menu while the menu is still appearing", async () => {
        await openAppendMenu({ engine: "c8", locale: "en" });
        document
            .querySelector(".am-panel")!
            .getAnimations()
            .forEach((animation) => {
                animation.pause();
                animation.currentTime = 60;
            });

        await expect.poll(() => document.querySelector(".am-hover-card")).not.toBeNull();

        expect(
            document.querySelector(".am-hover-card")!.getBoundingClientRect().right,
        ).toBeLessThanOrEqual(document.querySelector(".am-panel")!.getBoundingClientRect().left);
    });
});
