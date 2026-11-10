import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";

import { createModeler } from "./createModeler";
import type { ModelerMode } from "./mode/mode";
import type { BpmnModeler } from "./modeler";
import { FAR_FROM_ORIGIN_XML } from "./__fixtures__/bpmnXml";
import { afterPaint, mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

/**
 * Pins the template chooser against the real properties panel and element
 * templates service it hooks into by event name: the panel's template button
 * fires `elementTemplates.select`, the chooser answers it, and the Design-mode
 * guard has to stop it first. The library's own specs fake all three.
 */

const ENGINES = [
    {
        engine: "c7",
        templateAttribute: "camunda:modelerTemplate",
        schema: "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json",
        prefix: "camunda",
        namespace: "http://camunda.org/schema/1.0/bpmn",
    },
    {
        engine: "c8",
        templateAttribute: "zeebe:modelerTemplate",
        schema: "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
        prefix: "zeebe",
        namespace: "http://camunda.org/schema/zeebe/1.0",
    },
] as const;

type EngineCase = (typeof ENGINES)[number];

const TEMPLATE_ID = "com.example.audit";

const SELECT_TEMPLATE_BUTTON = ".bio-properties-panel-select-template-button";

const modelers: BpmnModeler[] = [];

function auditTemplate(engine: EngineCase) {
    return {
        $schema: engine.schema,
        id: TEMPLATE_ID,
        name: "Audit task",
        appliesTo: ["bpmn:Task"],
        properties: [
            { type: "Hidden", value: "Audit", binding: { type: "property", name: "name" } },
        ],
    };
}

function mailTemplate(engine: EngineCase) {
    return { ...auditTemplate(engine), id: "com.example.mail", name: "Mail task" };
}

function versionedAuditTemplate(engine: EngineCase, version: number) {
    return {
        ...auditTemplate(engine),
        version,
        properties: [
            { label: "Label", type: "String", binding: { type: "property", name: "name" } },
        ],
    };
}

/** Task_1 already uses version 1 of the audit template. */
function auditedTaskXml(engine: EngineCase): string {
    return FAR_FROM_ORIGIN_XML.replace(
        'targetNamespace="http://bpmn.io/schema/bpmn"',
        `targetNamespace="http://bpmn.io/schema/bpmn" xmlns:${engine.prefix}="${engine.namespace}"`,
    ).replace(
        '<bpmn:task id="Task_1" name="A" />',
        `<bpmn:task id="Task_1" name="A" ${engine.prefix}:modelerTemplate="${TEMPLATE_ID}" ${engine.prefix}:modelerTemplateVersion="1" />`,
    );
}

async function openModeler(
    engine: EngineCase,
    mode: ModelerMode,
    {
        elementTemplates = [auditTemplate(engine)],
        xml = FAR_FROM_ORIGIN_XML,
    }: { elementTemplates?: object[]; xml?: string } = {},
) {
    const { container, panel } = mountWithPanel(400, 300);
    // The canvas host is absolutely positioned and would cover an in-flow panel.
    panel.style.cssText = "position:absolute;top:300px;width:400px";
    const modeler = await createModeler(container, {
        engine: engine.engine,
        mode,
        propertiesPanel: { parent: panel },
        linting: false,
        elementTemplates,
    });
    modelers.push(modeler);
    await modeler.loadDiagram(xml);
    await afterPaint();
    const elementRegistry = modeler.getService("elementRegistry");
    modeler.getService("selection").select(elementRegistry.get("Task_1")!);
    const taskAttribute = (name: string): unknown =>
        elementRegistry.get("Task_1")!.businessObject.get(name);
    return { modeler, panel, taskAttribute };
}

function chooserRoots(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>(".etc-overlay-root"));
}

function offeredTemplateNames(): (string | null)[] {
    return Array.from(
        document.querySelectorAll(".etc-overlay-root .etc-card-name"),
        (name) => name.textContent,
    );
}

function chooserControl(selector: string): HTMLElement | null {
    return document.querySelector<HTMLElement>(`.etc-overlay-root ${selector}`);
}

beforeAll(async () => {
    // The chooser modal is wider than the default viewport, which hides its apply button.
    await page.viewport(1280, 800);
});

afterEach(async () => {
    await afterPaint();
    modelers.splice(0).forEach((modeler) => modeler.destroy());
    chooserRoots().forEach((root) => root.remove());
    removeMounts();
});

describe.each(ENGINES)("$engine element template chooser", (engine) => {
    it("applies a template picked from the panel's template button as one undoable step", async () => {
        const { modeler, panel, taskAttribute } = await openModeler(engine, "implement");
        const commandStack = modeler.getService("commandStack");
        const selectButton = () => panel.querySelector<HTMLElement>(SELECT_TEMPLATE_BUTTON);

        await expect.poll(selectButton).not.toBeNull();
        await userEvent.click(selectButton()!);

        expect(chooserRoots()).toHaveLength(1);
        expect(offeredTemplateNames()).toEqual(["Audit task"]);

        await userEvent.click(chooserControl(".etc-template-card")!);
        await expect.poll(() => chooserControl(".etc-apply-btn")).not.toBeNull();
        await userEvent.click(chooserControl(".etc-apply-btn")!);

        expect(chooserRoots()).toHaveLength(0);
        expect(taskAttribute(engine.templateAttribute)).toBe(TEMPLATE_ID);
        expect(taskAttribute("name")).toBe("Audit");
        expect(await modeler.exportDiagram()).toContain(
            `${engine.templateAttribute}="${TEMPLATE_ID}"`,
        );

        commandStack.undo();

        expect(taskAttribute(engine.templateAttribute)).toBeUndefined();
        expect(taskAttribute("name")).toBe("A");
        expect(commandStack.canUndo()).toBe(false);
        expect(await modeler.exportDiagram()).not.toContain(engine.templateAttribute);
    });

    it("opens no chooser in Design mode until the modeler switches to Implement", async () => {
        const { modeler, panel, taskAttribute } = await openModeler(engine, "design");
        const eventBus = modeler.getService("eventBus");
        const element = modeler.getService("elementRegistry").get("Task_1");

        await expect
            .poll(() => panel.querySelector('[data-group-id="group-general"]'))
            .not.toBeNull();
        expect(panel.querySelector(SELECT_TEMPLATE_BUTTON)).toBeNull();

        // The event the template button fires, as a stale panel or another caller would.
        eventBus.fire("elementTemplates.select", { element });
        expect(chooserRoots()).toHaveLength(0);

        modeler.setMode("implement");
        eventBus.fire("elementTemplates.select", { element });
        expect(chooserRoots()).toHaveLength(1);

        await userEvent.click(chooserControl(".etc-close-btn")!);
        expect(chooserRoots()).toHaveLength(0);
        expect(taskAttribute(engine.templateAttribute)).toBeUndefined();
    });

    it("lists no hidden template", async () => {
        const { modeler, panel } = await openModeler(engine, "implement", {
            elementTemplates: [auditTemplate(engine), mailTemplate(engine)],
        });
        modeler.setHiddenElementTemplates([{ id: TEMPLATE_ID }]);
        const selectButton = () => panel.querySelector<HTMLElement>(SELECT_TEMPLATE_BUTTON);

        await expect.poll(selectButton).not.toBeNull();
        await userEvent.click(selectButton()!);

        expect(offeredTemplateNames()).toEqual(["Mail task"]);
    });

    it("keeps an element on a hidden template: its properties and the update prompt stay", async () => {
        const { modeler, panel } = await openModeler(engine, "implement", {
            elementTemplates: [
                versionedAuditTemplate(engine, 1),
                versionedAuditTemplate(engine, 2),
            ],
            xml: auditedTaskXml(engine),
        });

        modeler.setHiddenElementTemplates([
            { id: TEMPLATE_ID, version: 1 },
            { id: TEMPLATE_ID, version: 2 },
        ]);
        // Re-render the panel for the selected element with the refs in place.
        modeler.getService("selection").select([]);
        modeler
            .getService("selection")
            .select(modeler.getService("elementRegistry").get("Task_1")!);

        await expect
            .poll(() =>
                panel.querySelector('[data-group-id="group-ElementTemplates__CustomProperties"]'),
            )
            .not.toBeNull();
        expect(
            panel.querySelector(".bio-properties-panel-template-update-available"),
        ).not.toBeNull();
        expect(panel.querySelector(".bio-properties-panel-template-not-found")).toBeNull();
    });
});
