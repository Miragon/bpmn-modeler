import type { Element, Shape } from "bpmn-js/lib/model/Types";
import { afterEach, describe, expect, it } from "vitest";

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
    close(): void;
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
        modeler.setHiddenElementTemplates([{ id: DEFAULT_TASK_ID }]);

        const task = createTask(modeler);

        expect(task.businessObject.get(engine.templateAttribute)).toBeUndefined();
        expect(task.businessObject.get("name")).toBeUndefined();
    });

    it("is not applied to a new connection once hidden", async () => {
        const modeler = await openModeler(engine, templates);
        modeler.setHiddenElementTemplates([{ id: DEFAULT_FLOW_ID }]);

        const flow = connectTasks(modeler);

        expect(flow.businessObject.get(engine.templateAttribute)).toBeUndefined();
    });
});

function openReplaceMenu(modeler: BpmnModeler): void {
    const task = modeler.getService("elementRegistry").get("Task_1");
    modeler
        .getService<PopupMenuService>("popupMenu")
        .open(task, "bpmn-replace", { x: 320, y: 200 });
}

function templatesTab(): HTMLElement | undefined {
    return Array.from(document.querySelectorAll<HTMLElement>(".djs-popup-tab")).find(
        (tab) => tab.textContent === "Templates",
    );
}

function replaceTemplateEntryIds(): (string | null)[] {
    return Array.from(document.querySelectorAll(".djs-popup .entry"), (entry) =>
        entry.getAttribute("data-id"),
    ).filter((id) => id?.startsWith("replace.template-"));
}

/** The templates Task_1's replace menu offers; none when it shows no Templates tab. */
async function offeredReplaceTemplates(modeler: BpmnModeler): Promise<(string | null)[]> {
    openReplaceMenu(modeler);
    // The menu resets its active tab in an effect after its first paint.
    await afterPaint();
    const tab = templatesTab();
    if (tab) {
        tab.click();
        await expect.poll(() => templatesTab()?.getAttribute("aria-selected")).toBe("true");
    }
    const offered = replaceTemplateEntryIds();
    modeler.getService<PopupMenuService>("popupMenu").close();
    return offered;
}

describe.each(ENGINES)("$engine replace menu", (engine) => {
    const templates = [taskTemplate(engine, "audit"), taskTemplate(engine, "mail")];

    it("leaves a hidden template out of the Templates tab", async () => {
        const modeler = await openModeler(engine, templates);
        modeler.setHiddenElementTemplates([{ id: "audit" }]);

        expect(await offeredReplaceTemplates(modeler)).toEqual(["replace.template-mail"]);
    });

    it("shows no Templates tab once every template is hidden", async () => {
        const modeler = await openModeler(engine, templates);
        modeler.setHiddenElementTemplates([{ id: "audit" }, { id: "mail" }]);

        openReplaceMenu(modeler);

        expect(templatesTab()).toBeUndefined();
    });
});

describe("setHiddenElementTemplates", () => {
    const engine = ENGINES[1];
    const templates = [taskTemplate(engine, "audit"), taskTemplate(engine, "mail")];

    it("keeps its refs when the templates are replaced", async () => {
        const modeler = await openModeler(engine, []);
        modeler.setHiddenElementTemplates([{ id: "audit" }]);

        modeler.setElementTemplates(templates);

        expect(await offeredReplaceTemplates(modeler)).toEqual(["replace.template-mail"]);
    });

    it("keeps its refs across a re-init of the engine", async () => {
        const modeler = await openModeler(engine, templates);
        modeler.setHiddenElementTemplates([{ id: "audit" }]);

        await modeler.init();
        modeler.setElementTemplates(templates);
        await modeler.loadDiagram(FAR_FROM_ORIGIN_XML);
        await afterPaint();

        expect(await offeredReplaceTemplates(modeler)).toEqual(["replace.template-mail"]);
    });

    it("offers every template again after an empty set", async () => {
        const modeler = await openModeler(engine, templates);
        modeler.setHiddenElementTemplates([{ id: "audit" }]);

        modeler.setHiddenElementTemplates([]);

        expect(await offeredReplaceTemplates(modeler)).toEqual([
            "replace.template-audit",
            "replace.template-mail",
        ]);
    });

    it("still hides its refs after Design mode, which offers no template at all", async () => {
        const modeler = await openModeler(engine, templates);
        modeler.setHiddenElementTemplates([{ id: "audit" }]);

        modeler.setMode("design");
        expect(await offeredReplaceTemplates(modeler)).toEqual([]);

        modeler.setMode("implement");
        expect(await offeredReplaceTemplates(modeler)).toEqual(["replace.template-mail"]);
    });

    it("offers no older version of an id whose latest version is hidden", async () => {
        const modeler = await openModeler(engine, [
            taskTemplate(engine, "audit", 1),
            taskTemplate(engine, "audit", 2),
            taskTemplate(engine, "mail"),
        ]);

        modeler.setHiddenElementTemplates([{ id: "audit", version: 2 }]);

        expect(await offeredReplaceTemplates(modeler)).toEqual(["replace.template-mail"]);
    });
});
