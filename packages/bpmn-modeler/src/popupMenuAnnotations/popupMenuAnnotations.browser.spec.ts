import type { Shape } from "bpmn-js/lib/model/Types";
import { afterEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";

import { getPopupMenuContext } from "@miragon/bpmn-modeler-append-menu";

import { createModeler } from "../createModeler";
import { createDesigner } from "../design/createDesigner";
import { afterPaint, mountWithPanel, removeMounts } from "../__fixtures__/surfaceMount";

interface PopupEntry {
    readonly description?: string;
    readonly search?: string | readonly string[];
    readonly tab?: { readonly id: string; readonly label: string };
}

interface PopupMenuService {
    open(
        target: unknown,
        providerId: string,
        position: { x: number; y: number },
        options?: { search: boolean },
    ): void;
    close(): void;
}

interface Surface {
    loadDiagram(xml: string): Promise<unknown>;
    getService<T>(name: string): T;
    destroy(): void;
}

type SurfaceName = "Design" | "C7" | "C8";

interface SurfaceOptions {
    readonly locale?: string;
    readonly elementTemplates?: object[];
}

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

const TASK_TEMPLATES: Readonly<Record<"C7" | "C8", object>> = {
    C7: {
        $schema: "https://unpkg.com/@camunda/element-templates-json-schema/resources/schema.json",
        id: "payment-task",
        name: "Payment",
        appliesTo: ["bpmn:Task"],
        properties: [],
    },
    C8: {
        $schema:
            "https://unpkg.com/@camunda/zeebe-element-templates-json-schema/resources/schema.json",
        id: "payment-task",
        name: "Payment",
        appliesTo: ["bpmn:Task"],
        properties: [],
    },
};

const ALL_SURFACES: readonly SurfaceName[] = ["Design", "C7", "C8"];

const surfaces: Surface[] = [];

afterEach(() => {
    surfaces.splice(0).forEach((surface) => surface.destroy());
    removeMounts();
});

async function openSurface(name: SurfaceName, options: SurfaceOptions = {}): Promise<Surface> {
    const { container, panel } = mountWithPanel(1200, 800);
    const locale = options.locale ?? "en";
    const surface: Surface =
        name === "Design"
            ? await createDesigner(container, { propertiesPanel: { parent: panel }, locale })
            : await createModeler(container, {
                  propertiesPanel: { parent: panel },
                  engine: name === "C7" ? "c7" : "c8",
                  locale,
                  elementTemplates: options.elementTemplates,
              });
    surfaces.push(surface);
    await surface.loadDiagram(XML);
    await afterPaint();
    return surface;
}

function taskOf(surface: Surface): Shape {
    return surface.getService<{ get(id: string): Shape }>("elementRegistry").get("Task_1");
}

function replaceEntries(surface: Surface): Readonly<Record<string, PopupEntry>> {
    return getPopupMenuContext(surface.getService("popupMenu"), taskOf(surface), "bpmn-replace")
        .entries as Readonly<Record<string, PopupEntry>>;
}

function openReplaceMenu(surface: Surface): void {
    surface
        .getService<PopupMenuService>("popupMenu")
        .open(taskOf(surface), "bpmn-replace", { x: 320, y: 200 }, { search: true });
}

async function searchReplaceMenu(surface: Surface, query: string): Promise<string[]> {
    openReplaceMenu(surface);
    await userEvent.type(
        document.querySelector<HTMLInputElement>(".djs-popup-search input")!,
        query,
    );
    await afterPaint();
    return Array.from(document.querySelectorAll(".djs-popup-results .entry"), (entry) =>
        entry.getAttribute("data-id"),
    ).filter((entryId): entryId is string => entryId !== null);
}

function popupTabLabels(): string[] {
    return Array.from(document.querySelectorAll(".djs-popup-tab"), (tab) =>
        tab.textContent!.trim(),
    );
}

describe("replace-menu descriptions", () => {
    it.each(ALL_SURFACES)("describe every element entry on %s", async (name) => {
        const entries = replaceEntries(await openSurface(name));
        const undescribedEntryIds = Object.entries(entries)
            .filter(([, entry]) => entry.description === undefined)
            .map(([entryId]) => entryId);

        expect(entries["replace-with-user-task"].description).toBe(
            "Work that needs to be done by a person",
        );
        expect(undescribedEntryIds).toEqual([]);
    });

    it.each([
        ["Design", "Automated work carried out by a system"],
        ["C7", "Automated work carried out by a Java delegate, expression, or external task"],
        ["C8", "Automated work carried out by a job worker or connector"],
    ] as const)("describe the service task in the terms of %s", async (name, description) => {
        const entries = replaceEntries(await openSurface(name));

        expect(entries["replace-with-service-task"].description).toBe(description);
    });

    it.each(ALL_SURFACES)("translate the reused descriptions on %s", async (name) => {
        const entries = replaceEntries(await openSurface(name, { locale: "de" }));

        expect(entries["replace-with-user-task"].description).toBe(
            "Arbeit, die von einer Person erledigt werden muss",
        );
    });
});

describe("replace-menu search", () => {
    it.each(ALL_SURFACES)("finds the call activity as a child process on %s", async (name) => {
        const results = await searchReplaceMenu(await openSurface(name), "child process");

        expect(results).toContain("replace-with-call-activity");
    });

    it.each([
        ["Design", []],
        ["C7", []],
        ["C8", ["replace-with-service-task", "replace-with-send-task", "replace-with-script-task"]],
    ] as const)("matches job workers only where %s runs them", async (name, expected) => {
        const results = await searchReplaceMenu(await openSurface(name), "job worker");

        expect(results.toSorted()).toEqual([...expected].sort());
        if (expected.length > 0) {
            expect(results[0]).toBe("replace-with-service-task");
        }
    });

    it.each([
        ["Design", []],
        ["C7", ["replace-with-service-task", "replace-with-send-task"]],
        ["C8", []],
    ] as const)("matches Java delegates only where %s runs them", async (name, expected) => {
        const results = await searchReplaceMenu(await openSurface(name), "java delegate");

        expect(results.toSorted()).toEqual([...expected].sort());
        if (expected.length > 0) {
            expect(results[0]).toBe("replace-with-service-task");
        }
    });
});

describe("replace-menu templates tab", () => {
    it.each(["C7", "C8"] as const)(
        "moves the templates of %s into a Templates tab next to BPMN",
        async (name) => {
            const surface = await openSurface(name, { elementTemplates: [TASK_TEMPLATES[name]] });

            expect(replaceEntries(surface)["replace.template-payment-task"].tab).toEqual({
                id: "templates",
                label: "Templates",
            });
            openReplaceMenu(surface);
            await afterPaint();
            expect(popupTabLabels()).toEqual(["BPMN", "Templates"]);
        },
    );

    it("shows no tabs on Design, which has no templates", async () => {
        openReplaceMenu(await openSurface("Design"));
        await afterPaint();

        expect(popupTabLabels()).toEqual([]);
    });

    it.each(["C7", "C8"] as const)(
        "describes removing the template of %s as the element's own type",
        async (name) => {
            const template = TASK_TEMPLATES[name];
            const surface = await openSurface(name, { elementTemplates: [template] });
            surface
                .getService<{ applyTemplate(element: Shape, template: object): Shape }>(
                    "elementTemplates",
                )
                .applyTemplate(taskOf(surface), template);

            expect(replaceEntries(surface)["replace-remove-element-template"].description).toBe(
                "An unspecified step, often used as a placeholder",
            );
        },
    );
});
