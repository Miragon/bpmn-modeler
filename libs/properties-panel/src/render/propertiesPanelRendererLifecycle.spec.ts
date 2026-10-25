import { Group } from "@bpmn-io/properties-panel";
import { act } from "@bpmn-io/properties-panel/preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
    BPMN_NAMESPACES,
    collectWindowErrors,
    createPanelServices,
    createRenderer,
    type PanelServices,
} from "../__fixtures__/panelHarness";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions ${BPMN_NAMESPACES} id="Definitions_1">
  <bpmn:process id="Process_1">
    <bpmn:task id="Task_1" />
  </bpmn:process>
</bpmn:definitions>`;

function hostElement(id?: string): HTMLElement {
    const element = document.createElement("div");
    if (id) {
        element.id = id;
    }
    document.body.appendChild(element);
    return element;
}

function recordPanelEvents({ eventBus }: PanelServices): string[] {
    const fired: string[] = [];
    for (const name of ["attach", "detach", "rendered"]) {
        eventBus.on(`propertiesPanel.${name}`, () => {
            fired.push(name);
        });
    }
    return fired;
}

const panelHeaderIn = (host: HTMLElement) => host.querySelector(".bio-properties-panel-header");

afterEach(() => {
    document.body.innerHTML = "";
});

describe("PropertiesPanelRenderer", () => {
    describe("mounting", () => {
        it("mounts into the configured parent once the diagram initialises", async () => {
            const services = await createPanelServices(XML);
            const parent = hostElement();
            const renderer = createRenderer(services, { parent });
            const fired = recordPanelEvents(services);

            services.eventBus.fire("diagram.init");

            expect(renderer._container.parentNode).toBe(parent);
            expect(fired).toEqual(["attach"]);
        });

        it("stays detached when no parent is configured", async () => {
            const services = await createPanelServices(XML);
            const renderer = createRenderer(services);
            const fired = recordPanelEvents(services);

            services.eventBus.fire("diagram.init");

            expect(renderer._container.parentNode).toBeNull();
            expect(fired).toEqual([]);
        });

        it("resolves a selector against the document", async () => {
            const renderer = createRenderer(await createPanelServices(XML));
            const parent = hostElement("panel-host");

            renderer.attachTo("#panel-host");

            expect(renderer._container.parentNode).toBe(parent);
        });

        it("moves to a new parent and leaves the old one empty", async () => {
            const services = await createPanelServices(XML);
            const renderer = createRenderer(services);
            const [first, second] = [hostElement(), hostElement()];
            const fired = recordPanelEvents(services);

            renderer.attachTo(first);
            renderer.attachTo(second);

            expect(first.childElementCount).toBe(0);
            expect(renderer._container.parentNode).toBe(second);
            expect(fired).toEqual(["attach", "detach", "attach"]);
        });

        it("rejects a missing container or header container", async () => {
            const renderer = createRenderer(await createPanelServices(XML));

            expect(() => renderer.attachTo(undefined)).toThrow("container required");
            expect(() => renderer.attachTo(hostElement(), "#missing")).toThrow(
                "header container not found",
            );
        });

        it("renders the header into a separate host and back inline", async () => {
            const renderer = createRenderer(await createPanelServices(XML));
            const [body, header] = [hostElement(), hostElement()];

            await act(() => renderer.attachTo(body, header));

            expect(panelHeaderIn(header)).not.toBeNull();
            expect(panelHeaderIn(body)).toBeNull();

            await act(() => renderer.attachTo(body));

            expect(header.childElementCount).toBe(0);
            expect(panelHeaderIn(body)).not.toBeNull();
        });
    });

    describe("unmounting", () => {
        it("leaves no DOM behind when the diagram is destroyed", async () => {
            const services = await createPanelServices(XML);
            const renderer = createRenderer(services);
            const [body, header] = [hostElement(), hostElement()];
            await act(() => renderer.attachTo(body, header));
            const fired = recordPanelEvents(services);

            services.eventBus.fire("diagram.destroy");

            expect(body.childElementCount).toBe(0);
            expect(header.childElementCount).toBe(0);
            expect(fired).toEqual(["detach"]);
        });

        it("reports no detach when it was never attached", async () => {
            const services = await createPanelServices(XML);
            createRenderer(services);
            const fired = recordPanelEvents(services);

            services.eventBus.fire("diagram.destroy");

            expect(fired).toEqual([]);
        });
    });

    describe("root rendering", () => {
        it("renders a newly added root", async () => {
            const services = await createPanelServices(XML);
            const renderer = createRenderer(services);
            const fired = recordPanelEvents(services);

            await act(() => {
                services.eventBus.fire("root.added", { element: services.shapeOf("Process_1") });
            });

            expect(renderer._container.querySelector(".bio-properties-panel")).not.toBeNull();
            expect(fired).toEqual(["rendered"]);
        });

        it("ignores implicit roots", async () => {
            const services = await createPanelServices(XML);
            const renderer = createRenderer(services);
            const fired = recordPanelEvents(services);

            await act(() => {
                services.eventBus.fire("root.added", {
                    element: { id: "__implicitroot", isImplicit: true },
                });
            });

            expect(renderer._container.childElementCount).toBe(0);
            expect(fired).toEqual([]);
        });
    });

    describe("providers", () => {
        it("hands lower-priority providers the groups built before them", async () => {
            const services = await createPanelServices(XML);
            const renderer = createRenderer(services);
            const groupsSeenByLowPriority: string[][] = [];
            renderer.registerProvider(2000, {
                getGroups: () => (groups: { id: string }[]) => [
                    ...groups,
                    { id: "early", label: "Early", component: Group, entries: [] },
                ],
            });
            renderer.registerProvider(500, {
                getGroups: () => (groups: { id: string }[]) => {
                    groupsSeenByLowPriority.push(groups.map((group) => group.id));
                    return groups;
                },
            });

            await act(() => renderer._render(services.shapeOf("Process_1")));

            expect(groupsSeenByLowPriority[0]).toEqual(["early", "general", "documentation"]);
        });

        it("reports and skips a provider without getGroups", async () => {
            const services = await createPanelServices(XML);
            const renderer = createRenderer(services);
            const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

            renderer.registerProvider({ getEntryId: () => "entry" });
            await act(() => renderer._render(services.shapeOf("Process_1")));

            expect(consoleError).toHaveBeenCalledWith(
                "Properties provider does not implement #getGroups(element) API",
            );
            expect(renderer._container.querySelector("[data-group-id]")).not.toBeNull();
            consoleError.mockRestore();
        });
    });

    describe("undo and redo keys inside the panel", () => {
        async function setup({ readonly = false } = {}) {
            const services = await createPanelServices(XML, { readonly });
            const renderer = createRenderer(services);
            const task = services.elementsById.Task_1;
            const pressKey = (init: KeyboardEventInit) => {
                const event = new KeyboardEvent("keydown", {
                    bubbles: true,
                    cancelable: true,
                    ...init,
                });
                renderer._container.dispatchEvent(event);
                return { trapped: event.defaultPrevented };
            };
            const rename = (name: string) =>
                services.commandStack!.execute("element.updateModdleProperties", {
                    element: services.shapeOf("Task_1"),
                    moddleElement: task,
                    properties: { name },
                });
            return { ...services, pressKey, rename, taskName: () => task.get("name") };
        }

        it("drive the diagram's command stack once the keyboard is bound", async () => {
            const { eventBus, pressKey, rename, taskName } = await setup();
            eventBus.fire("keyboard.bind");
            rename("Charge");

            expect(pressKey({ key: "z", ctrlKey: true })).toEqual({ trapped: true });
            expect(taskName()).toBeUndefined();

            expect(pressKey({ key: "y", ctrlKey: true })).toEqual({ trapped: true });
            expect(taskName()).toBe("Charge");

            expect(pressKey({ key: "z", metaKey: true })).toEqual({ trapped: true });
            expect(taskName()).toBeUndefined();

            expect(pressKey({ key: "z", ctrlKey: true, shiftKey: true })).toEqual({
                trapped: true,
            });
            expect(taskName()).toBe("Charge");
        });

        it("let other keys through", async () => {
            const { eventBus, pressKey, rename, taskName } = await setup();
            eventBus.fire("keyboard.bind");
            rename("Charge");

            expect(pressKey({ key: "a", ctrlKey: true })).toEqual({ trapped: false });
            expect(taskName()).toBe("Charge");
        });

        it("stop once the keyboard is unbound", async () => {
            const { eventBus, pressKey, rename, taskName } = await setup();
            eventBus.fire("keyboard.bind");
            eventBus.fire("keyboard.unbind");
            rename("Charge");

            expect(pressKey({ key: "z", ctrlKey: true })).toEqual({ trapped: false });
            expect(taskName()).toBe("Charge");
        });

        it("are never handled in the viewer", async () => {
            const { eventBus, pressKey } = await setup({ readonly: true });
            const windowErrors = collectWindowErrors();
            eventBus.fire("keyboard.bind");

            expect(pressKey({ key: "z", ctrlKey: true })).toEqual({ trapped: false });
            expect(windowErrors).toEqual([]);
        });
    });
});
