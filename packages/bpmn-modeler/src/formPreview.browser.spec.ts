import { afterEach, describe, expect, it, vi } from "vitest";
import zeebeModdle from "zeebe-bpmn-moddle/resources/zeebe.json";
import type { FormPreviewRequest, ModelNavigationPort } from "@miragon/bpmn-model-navigation";

import { createModeler } from "./createModeler";
import { createDesigner } from "./design/createDesigner";
import { createViewer } from "./viewer/createViewer";
import { FAR_FROM_ORIGIN_XML } from "./__fixtures__/bpmnXml";
import { afterPaint, mountWithPanel, removeMounts } from "./__fixtures__/surfaceMount";

function moddleDescriptor(value: unknown): object {
    if (value === null || typeof value !== "object")
        throw new Error("Expected a moddle descriptor");
    return value;
}

const zeebeDescriptor = moddleDescriptor(zeebeModdle);

const XML = FAR_FROM_ORIGIN_XML.replace(
    "<bpmn:definitions ",
    '<bpmn:definitions xmlns:zeebe="http://camunda.org/schema/zeebe/1.0" ',
).replace(
    '<bpmn:task id="Task_1" name="A" />',
    '<bpmn:userTask id="Task_1"><bpmn:extensionElements><zeebe:formDefinition formId="Form_1" /></bpmn:extensionElements></bpmn:userTask>',
);

let handle: { destroy(): void } | undefined;
afterEach(async () => {
    await afterPaint();
    handle?.destroy();
    handle = undefined;
    removeMounts();
});

describe("linked form preview preference in real bpmn-js surfaces", () => {
    it.each(["View", "Design", "Implement"] as const)(
        "keeps the manual eye usable while disabled in %s and restores automatic preview",
        async (mode) => {
            let automatic = false;
            const listeners = new Set<() => void>();
            const requests: FormPreviewRequest[] = [];
            const closed = vi.fn();
            const port: ModelNavigationPort = {
                openReference: () => undefined,
                formPreview: {
                    isAutomaticEnabled: () => automatic,
                    onAutomaticChanged: (listener) => {
                        listeners.add(listener);
                        return () => {
                            listeners.delete(listener);
                        };
                    },
                    open: (request) => {
                        requests.push(request);
                        return { close: closed, reposition: () => undefined };
                    },
                },
            };
            const setAutomatic = (enabled: boolean) => {
                automatic = enabled;
                listeners.forEach((listener) => listener());
            };
            const { container, panel } = mountWithPanel();
            const options = {
                capabilities: { modelNavigation: port },
                moddleExtensions: { zeebe: zeebeDescriptor },
                propertiesPanel: { parent: panel },
            };
            const surface =
                mode === "View"
                    ? await createViewer(container, options)
                    : mode === "Design"
                      ? await createDesigner(container, options)
                      : await createModeler(container, { ...options, engine: "c8" });
            handle = surface;
            await surface.loadDiagram(XML);
            await afterPaint();
            surface.selection.selectElementsByIds(["Task_1"]);
            expect(requests).toEqual([]);
            const eye = container.querySelector<HTMLButtonElement>(
                '[data-action="preview-linked-form"]',
            );
            expect(eye).not.toBeNull();
            eye!.click();
            expect(requests).toHaveLength(1);
            expect(requests[0].automatic).toBe(false);
            expect(automatic).toBe(false);
            requests[0].onVisibilityChanged(true);
            setAutomatic(true);
            setAutomatic(false);
            expect(closed).not.toHaveBeenCalled();
            surface.selection.selectElementsByIds([]);
            surface.selection.selectElementsByIds(["Task_1"]);
            expect(requests).toHaveLength(1);
            setAutomatic(true);
            expect(requests).toHaveLength(2);
            expect(requests[1].automatic).toBe(true);
            requests[1].onVisibilityChanged(true);
            setAutomatic(false);
            expect(container.querySelector('[data-action="preview-linked-form"]')).not.toBeNull();
            expect(closed).toHaveBeenCalledTimes(2);
            await afterPaint();
            surface.destroy();
            handle = undefined;
            expect(listeners.size).toBe(0);
        },
    );
});
