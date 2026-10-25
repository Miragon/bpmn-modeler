/**
 * Renders the real properties panel (renderer + neutral provider + the fork's
 * cmd module) against a real bpmn-moddle tree, wired to a real diagram-js
 * CommandStack with bpmn-js' `element.updateModdleProperties` handler. Group
 * setters therefore mutate the moddle and undo exactly as in a modeler, while
 * jsdom never has to lay out an SVG canvas (which bpmn-js cannot do there).
 */
import { act } from "@bpmn-io/properties-panel/preact/test-utils";
import * as bpmnModdlePackage from "bpmn-moddle";
import BpmnFactory from "bpmn-js/lib/features/modeling/BpmnFactory";
import UpdateModdlePropertiesHandler from "bpmn-js/lib/features/modeling/cmd/UpdateModdlePropertiesHandler";
import CommandStack from "diagram-js/lib/command/CommandStack";
import EventBus from "diagram-js/lib/core/EventBus";
import { Ids } from "ids";
import { onTestFinished } from "vitest";

import CommandsModule from "../cmd";
import NeutralPropertiesProvider from "../provider/NeutralPropertiesProvider";
import PropertiesPanelRenderer from "../render/PropertiesPanelRenderer";

export interface ModdleElement {
    $type: string;
    $parent?: ModdleElement;
    id?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(property: string): any;
    set(property: string, value: unknown): void;
}

interface Shape {
    id: string;
    type: string;
    businessObject: ModdleElement;
}

interface Moddle {
    ids: Ids;
    fromXML(xml: string): Promise<{
        rootElement: ModdleElement;
        elementsById: Record<string, ModdleElement>;
        warnings: unknown[];
    }>;
}

interface Injectable {
    new (...dependencies: never[]): unknown;
    $inject?: string[];
}

export const BPMN_NAMESPACES = `xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" targetNamespace="http://bpmn.io/schema/bpmn"`;

/**
 * Parses a fixture that must be valid and claims every id the way the bpmn-js
 * importer does, so id-uniqueness validation sees the existing elements.
 */
async function loadDefinitions(xml: string) {
    const { BpmnModdle } = bpmnModdlePackage as unknown as { BpmnModdle: () => Moddle };
    const moddle = BpmnModdle();
    const { rootElement: definitions, elementsById, warnings } = await moddle.fromXML(xml);
    if (warnings.length > 0) {
        throw new Error(`fixture parsed with warnings: ${JSON.stringify(warnings)}`);
    }
    moddle.ids = new Ids([32, 36, 1]);
    for (const [id, element] of Object.entries(elementsById)) {
        moddle.ids.claim(id, element);
    }
    return { moddle, definitions, elementsById };
}

/**
 * The services a bpmn-js modeler would give the panel, with a canvas that only
 * knows its root. `readonly` leaves out `commandStack`, `bpmnFactory` and
 * `modeling`, exactly like a `NavigatedViewer`.
 */
export async function createPanelServices(xml: string, { readonly = false } = {}) {
    const { moddle, definitions, elementsById } = await loadDefinitions(xml);
    const eventBus = new EventBus();

    // One shape per id: the panel matches `elements.changed` by identity.
    const shapes = new Map<string, Shape>();
    const shapeOf = (id: string): Shape => {
        const businessObject = elementsById[id];
        if (!businessObject) {
            throw new Error(`no element "${id}" in fixture`);
        }
        if (!shapes.has(id)) {
            shapes.set(id, { id, type: businessObject.$type, businessObject });
        }
        return shapes.get(id)!;
    };

    const rootElements: ModdleElement[] = definitions.get("rootElements");
    const canvasRoot =
        rootElements.find((element) => element.$type === "bpmn:Collaboration") ??
        rootElements.find((element) => element.$type === "bpmn:Process");

    const services: Record<string, unknown> = {
        eventBus,
        canvas: { getRootElement: () => (canvasRoot ? shapeOf(canvasRoot.id!) : undefined) },
        elementRegistry: {
            get: (id: string) => (elementsById[id] ? shapeOf(id) : undefined),
            filter: (predicate: (shape: Shape) => boolean) =>
                Object.keys(elementsById).map(shapeOf).filter(predicate),
        },
        translate: (text: string) => text,
        debounceInput: (callback: unknown) => callback,
    };

    const injector = {
        get(name: string, strict?: boolean): unknown {
            if (name in services) {
                return services[name];
            }
            if (strict === false) {
                return null;
            }
            throw new Error(`No provider for "${name}"`);
        },
        instantiate(Type: Injectable): unknown {
            const dependencies = (Type.$inject ?? []).map((name) => injector.get(name));
            return new Type(...(dependencies as never[]));
        },
    };
    services.injector = injector;

    let commandStack: CommandStack | undefined;
    if (!readonly) {
        commandStack = new CommandStack(eventBus, injector as never);
        commandStack.registerHandler(
            "element.updateModdleProperties",
            UpdateModdlePropertiesHandler as never,
        );
        services.commandStack = commandStack;
        services.bpmnFactory = new BpmnFactory(moddle as never);
        // Presence alone makes the panel editable; no entry under test writes through it.
        services.modeling = {};
    }

    for (const initializer of CommandsModule.__init__) {
        injector.instantiate(initializer as unknown as Injectable);
    }

    return { injector, eventBus, commandStack, definitions, elementsById, shapeOf };
}

export type PanelServices = Awaited<ReturnType<typeof createPanelServices>>;

/** The real renderer with the neutral provider registered, unmounted after the test. */
export function createRenderer(
    { injector, eventBus }: PanelServices,
    config: Record<string, unknown> = {},
) {
    installIntersectionObserverStub();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const renderer: any = new PropertiesPanelRenderer(config, injector, eventBus);
    new NeutralPropertiesProvider(renderer, injector);
    onTestFinished(() => renderer._destroy());
    return renderer;
}

/** Mounts the panel for one element and returns DOM-level drivers for it. */
export async function renderPanel(xml: string, elementId: string, { readonly = false } = {}) {
    const services = await createPanelServices(xml, { readonly });
    const { eventBus, commandStack, shapeOf } = services;

    // Attached to the document because ReferenceSelect looks its focus target up globally.
    const host = document.createElement("div");
    document.body.appendChild(host);
    onTestFinished(() => host.remove());

    const renderer = createRenderer(services, { parent: host });
    eventBus.fire("diagram.init");

    // The panel pins its first element in state, so a harness serves one element.
    await act(() => renderer._render(shapeOf(elementId)));

    const entry = (entryId: string) =>
        host.querySelector<HTMLElement>(`[data-entry-id="${entryId}"]`);

    function control<T extends HTMLElement = HTMLInputElement>(entryId: string): T {
        const input = entry(entryId)?.querySelector<T>(".bio-properties-panel-input");
        if (!input) {
            throw new Error(`entry "${entryId}" is not rendered`);
        }
        return input;
    }

    async function dispatch(target: HTMLElement, type: "input" | "change") {
        await act(() => {
            target.dispatchEvent(new Event(type, { bubbles: true }));
        });
    }

    return {
        ...services,
        host,
        renderer,
        groupIds: () =>
            Array.from(host.querySelectorAll("[data-group-id]"), (group) =>
                group.getAttribute("data-group-id")!.replace(/^group-/, ""),
            ),
        entryIds: (groupId: string) =>
            Array.from(
                host.querySelectorAll(
                    `[data-group-id="group-${groupId}"] .bio-properties-panel-group-entries > [data-entry-id]`,
                ),
                (element) => element.getAttribute("data-entry-id")!,
            ),
        entry,
        control,
        optionValues: (entryId: string) =>
            Array.from(control<HTMLSelectElement>(entryId).options, (option) => option.value),
        async selectOption(entryId: string, value: string) {
            const select = control<HTMLSelectElement>(entryId);
            select.value = value;
            await dispatch(select, "input");
        },
        async typeText(entryId: string, value: string) {
            const input = control(entryId);
            input.value = value;
            await dispatch(input, "input");
        },
        async toggleCheckbox(entryId: string) {
            const checkbox = control(entryId);
            checkbox.checked = !checkbox.checked;
            await dispatch(checkbox, "change");
        },
        async undo() {
            await act(() => commandStack!.undo());
        },
    };
}

export type PanelHarness = Awaited<ReturnType<typeof renderPanel>>;

/** Errors thrown by DOM event handlers, which jsdom reports on `window` instead of rethrowing. */
export function collectWindowErrors(): unknown[] {
    const errors: unknown[] = [];
    const record = (event: ErrorEvent) => {
        errors.push(event.error);
        event.preventDefault();
    };
    window.addEventListener("error", record);
    onTestFinished(() => window.removeEventListener("error", record));
    return errors;
}

function installIntersectionObserverStub(): void {
    // The group's sticky header observes the scroll container; jsdom has no IntersectionObserver.
    globalThis.IntersectionObserver ??= class {
        observe = () => {};
        unobserve = () => {};
        disconnect = () => {};
    } as unknown as typeof IntersectionObserver;
}
