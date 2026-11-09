import type { Element, Shape } from "bpmn-js/lib/model/Types";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import type { ElementTemplateRef } from "@miragon/bpmn-modeler-types";

import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";
import { FAR_FROM_ORIGIN_XML } from "./__fixtures__/bpmnXml";
import { afterPaint, mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

/**
 * Pins the offer filter against the real element templates service and the
 * create-append-anything menus it narrows. The unit specs fake both.
 */

const ENGINES = [
    {
        engine: "c7",
        templateAttribute: "camunda:modelerTemplate",
        schema: "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json",
    },
    {
        engine: "c8",
        templateAttribute: "zeebe:modelerTemplate",
        schema: "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
    },
] as const;

type EngineCase = (typeof ENGINES)[number];

const DEFAULT_TASK_ID = "com.example.default-task";
const DEFAULT_FLOW_ID = "com.example.default-flow";

interface Modeling {
    createShape(
        attrs: { type: string },
        position: { x: number; y: number },
        parent: unknown,
    ): Shape;
    connect(source: unknown, target: unknown): Element;
}

interface PopupMenuService {
    open(target: unknown, providerId: string, position: { x: number; y: number }): void;
}

const modelers: BpmnModeler[] = [];

function taskTemplate(engine: EngineCase, id: string, version?: number) {
    return {
        $schema: engine.schema,
        id,
        name: version === undefined ? id : `${id} v${version}`,
        version,
        appliesTo: ["bpmn:Task"],
        properties: [],
    };
}

function defaultTemplate(engine: EngineCase, id: string, appliesTo: string) {
    return {
        $schema: engine.schema,
        id,
        name: id,
        appliesTo: [appliesTo],
        isDefault: true,
        properties: [
            { type: "Hidden", value: "Defaulted", binding: { type: "property", name: "name" } },
        ],
    };
}

async function openModeler(engine: EngineCase, elementTemplates: object[]) {
    const { container, panel } = mountWithPanel(400, 300);
    const modeler = await createModeler(container, {
        engine: engine.engine,
        propertiesPanel: { parent: panel },
        linting: false,
        elementTemplates,
    });
    modelers.push(modeler);
    await modeler.loadDiagram(FAR_FROM_ORIGIN_XML);
    await afterPaint();
    return modeler;
}

function hide(modeler: BpmnModeler, refs: ElementTemplateRef[]): void {
    modeler
        .getService<{ setHidden(refs: ElementTemplateRef[]): void }>("elementTemplateOffer")
        .setHidden(refs);
}

function createTask(modeler: BpmnModeler): Element {
    const canvas = modeler.getService("canvas");
    return modeler
        .getService<Modeling>("modeling")
        .createShape({ type: "bpmn:Task" }, { x: 5250, y: 4200 }, canvas.getRootElement());
}

function connectTasks(modeler: BpmnModeler): Element {
    const elementRegistry = modeler.getService("elementRegistry");
    return modeler
        .getService<Modeling>("modeling")
        .connect(elementRegistry.get("Task_1")!, elementRegistry.get("Task_2")!);
}

afterEach(async () => {
    await afterPaint();
    modelers.splice(0).forEach((modeler) => modeler.destroy());
    removeMounts();
});

describe.each(ENGINES)("$engine default element template", (engine) => {
    const templates = [
        defaultTemplate(engine, DEFAULT_TASK_ID, "bpmn:Task"),
        defaultTemplate(engine, DEFAULT_FLOW_ID, "bpmn:SequenceFlow"),
    ];

    it("is applied to a new shape and a new connection while offered", async () => {
        const modeler = await openModeler(engine, templates);

        const task = createTask(modeler);
        const flow = connectTasks(modeler);

        expect(task.businessObject.get(engine.templateAttribute)).toBe(DEFAULT_TASK_ID);
        expect(task.businessObject.get("name")).toBe("Defaulted");
        expect(flow.businessObject.get(engine.templateAttribute)).toBe(DEFAULT_FLOW_ID);
    });

    it("is not applied to a new shape once hidden", async () => {
        const modeler = await openModeler(engine, templates);
        hide(modeler, [{ id: DEFAULT_TASK_ID }]);

        const task = createTask(modeler);

        expect(task.businessObject.get(engine.templateAttribute)).toBeUndefined();
        expect(task.businessObject.get("name")).toBeUndefined();
    });

    it("is not applied to a new connection once hidden", async () => {
        const modeler = await openModeler(engine, templates);
        hide(modeler, [{ id: DEFAULT_FLOW_ID }]);

        const flow = connectTasks(modeler);

        expect(flow.businessObject.get(engine.templateAttribute)).toBeUndefined();
    });
});

describe.each(ENGINES)("$engine replace menu", (engine) => {
    const templates = [taskTemplate(engine, "audit"), taskTemplate(engine, "mail")];

    function openReplaceMenu(modeler: BpmnModeler): void {
        const task = modeler.getService("elementRegistry").get("Task_1");
        modeler
            .getService<PopupMenuService>("popupMenu")
            .open(task, "bpmn-replace", { x: 320, y: 200 });
    }

    function tabLabels(): (string | null)[] {
        return Array.from(document.querySelectorAll(".djs-popup-tab"), (tab) => tab.textContent);
    }

    function templateEntryIds(): (string | null)[] {
        return Array.from(document.querySelectorAll(".djs-popup .entry"), (entry) =>
            entry.getAttribute("data-id"),
        ).filter((id) => id?.startsWith("replace.template-"));
    }

    async function showTemplatesTab(): Promise<void> {
        const templatesTab = Array.from(
            document.querySelectorAll<HTMLElement>(".djs-popup-tab"),
        ).find((tab) => tab.textContent === "Templates");
        await userEvent.click(templatesTab!);
    }

    it("leaves a hidden template out of the Templates tab", async () => {
        const modeler = await openModeler(engine, templates);
        hide(modeler, [{ id: "audit" }]);

        openReplaceMenu(modeler);
        await showTemplatesTab();

        await expect.poll(templateEntryIds).toEqual(["replace.template-mail"]);
    });

    it("shows no Templates tab once every template is hidden", async () => {
        const modeler = await openModeler(engine, templates);
        hide(modeler, [{ id: "audit" }, { id: "mail" }]);

        openReplaceMenu(modeler);

        expect(tabLabels()).not.toContain("Templates");
    });
});
