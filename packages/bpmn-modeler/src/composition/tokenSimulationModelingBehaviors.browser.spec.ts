import { afterEach, describe, expect, it, vi } from "vitest";
import SimulationSupportModule from "bpmn-js-token-simulation/lib/simulation-support";

import { createDesigner } from "./createDesigner";
import { createModeler } from "./createModeler";
import {
    EVENT_BASED_GATEWAY_TARGETS_XML,
    MESSAGE_FLOWS_BETWEEN_POOLS_XML,
    SIMULATED_GATEWAY_AND_BOUNDARY_XML,
    SIMULATED_MESSAGE_FLOW_XML,
    tagAsCamunda7,
} from "../__fixtures__/bpmnXml";
import {
    afterPaint,
    mountWithPanel,
    removeMounts,
    type SurfaceMount,
} from "../__fixtures__/surfaceMount";

/**
 * bpmn-js's event-based gateway, boundary event and message flow modeling behaviours run on
 * every editable preset, although token simulation provides simulator behaviours under the
 * same DI names, and token simulation still simulates those elements.
 */

interface DiagramElement {
    id: string;
    incoming: DiagramElement[];
    source?: DiagramElement;
    target?: DiagramElement;
}

interface EditableSurface {
    loadDiagram(xml: string): Promise<unknown>;
    getService<T = unknown>(name: string): T;
    destroy(): void;
}

interface ElementRegistry {
    get(id: string): DiagramElement | undefined;
}

interface Modeling {
    connect(source: DiagramElement, target: DiagramElement): DiagramElement;
}

interface BpmnReplace {
    replaceElement(
        element: DiagramElement,
        target: { type: string; isExpanded?: boolean },
    ): DiagramElement;
}

interface SimulationSupport {
    toggleSimulation(active: boolean): void;
    getElementTrigger(id: string): unknown;
    triggerElement(id: string): void;
    elementEnter(id: string): Promise<unknown>;
    getHistory(): string[];
}

interface Animation {
    setAnimationSpeed(speed: number): void;
    animate(connection: DiagramElement, scope: unknown, done: () => void): void;
}

interface EditableSurfaceDescriptor {
    name: string;
    tagDiagram(xml: string): string;
    create(mount: SurfaceMount, additionalModules?: unknown[]): Promise<EditableSurface>;
}

const EDITABLE_SURFACES: EditableSurfaceDescriptor[] = [
    {
        name: "C7 modeler",
        tagDiagram: tagAsCamunda7,
        create: ({ container, panel }, additionalModules) =>
            createModeler(container, {
                engine: "c7",
                propertiesPanel: { parent: panel },
                additionalModules,
            }),
    },
    {
        name: "C8 modeler",
        tagDiagram: (xml) => xml,
        create: ({ container, panel }, additionalModules) =>
            createModeler(container, {
                engine: "c8",
                propertiesPanel: { parent: panel },
                additionalModules,
            }),
    },
    {
        name: "designer",
        tagDiagram: (xml) => xml,
        create: ({ container, panel }, additionalModules) =>
            createDesigner(container, { propertiesPanel: { parent: panel }, additionalModules }),
    },
];

function elementOf(surface: EditableSurface, id: string): DiagramElement {
    const element = surface.getService<ElementRegistry>("elementRegistry").get(id);
    if (!element) {
        throw new Error(`no element <${id}>`);
    }
    return element;
}

function exists(surface: EditableSurface, id: string): boolean {
    return surface.getService<ElementRegistry>("elementRegistry").get(id) !== undefined;
}

function connect(surface: EditableSurface, sourceId: string, targetId: string): void {
    surface
        .getService<Modeling>("modeling")
        .connect(elementOf(surface, sourceId), elementOf(surface, targetId));
}

function incomingSourceIds(surface: EditableSurface, id: string): (string | undefined)[] {
    return elementOf(surface, id).incoming.map((flow) => flow.source?.id);
}

function replace(
    surface: EditableSurface,
    id: string,
    target: { type: string; isExpanded?: boolean },
): DiagramElement {
    return surface
        .getService<BpmnReplace>("bpmnReplace")
        .replaceElement(elementOf(surface, id), target);
}

// Short, so a simulation that never gets there fails with a readable message.
const SIMULATION_STEP_TIMEOUT = 2000;

function within<T>(promise: Promise<T>, what: string): Promise<T> {
    return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
            setTimeout(
                () => reject(new Error(`the simulation never reached ${what}`)),
                SIMULATION_STEP_TIMEOUT,
            ),
        ),
    ]);
}

async function trigger(simulation: SimulationSupport, id: string): Promise<void> {
    await expect
        .poll(() => simulation.getElementTrigger(id), {
            timeout: SIMULATION_STEP_TIMEOUT,
            message: `no trigger for <${id}>`,
        })
        .toBeTruthy();
    simulation.triggerElement(id);
}

describe.each(EDITABLE_SURFACES)(
    "$name modeling behaviours beside token simulation",
    (descriptor) => {
        let surface: EditableSurface | undefined;

        async function open(xml: string): Promise<EditableSurface> {
            surface = await descriptor.create(mountWithPanel());
            await surface.loadDiagram(descriptor.tagDiagram(xml));
            return surface;
        }

        afterEach(async () => {
            await afterPaint();
            surface?.destroy();
            surface = undefined;
            removeMounts();
        });

        it("leaves only the gateway's flow when an event-based gateway connects to a target", async () => {
            const handle = await open(EVENT_BASED_GATEWAY_TARGETS_XML);

            connect(handle, "Gateway_G", "ReceiveTask_R");

            expect(incomingSourceIds(handle, "ReceiveTask_R")).toEqual(["Gateway_G"]);
            expect(exists(handle, "Flow_A")).toBe(false);
        });

        it("removes the gateway's flow when another element connects to an event-based target", async () => {
            const handle = await open(EVENT_BASED_GATEWAY_TARGETS_XML);

            connect(handle, "Task_B", "Catch_C");

            expect(incomingSourceIds(handle, "Catch_C")).toEqual(["Task_B"]);
            expect(exists(handle, "Flow_G")).toBe(false);
        });

        it("removes a receive task's boundary events when an event-based gateway connects to it", async () => {
            const handle = await open(EVENT_BASED_GATEWAY_TARGETS_XML);

            connect(handle, "Gateway_G", "ReceiveTask_R");

            expect(exists(handle, "Boundary_R")).toBe(false);
        });

        it("removes the targets' other incoming flows when a gateway becomes event-based", async () => {
            const handle = await open(EVENT_BASED_GATEWAY_TARGETS_XML);

            const eventBasedGateway = replace(handle, "Gateway_X", {
                type: "bpmn:EventBasedGateway",
            });

            expect(incomingSourceIds(handle, "ReceiveTask_S")).toEqual([eventBasedGateway.id]);
            expect(exists(handle, "Flow_B")).toBe(false);
        });

        it("removes the boundary events of receive-task targets when a gateway becomes event-based", async () => {
            const handle = await open(EVENT_BASED_GATEWAY_TARGETS_XML);

            replace(handle, "Gateway_X", { type: "bpmn:EventBasedGateway" });

            expect(exists(handle, "Boundary_S")).toBe(false);
        });

        it("reconnects message flows to a pool that collapses instead of deleting them", async () => {
            const handle = await open(MESSAGE_FLOWS_BETWEEN_POOLS_XML);

            const collapsedPool = replace(handle, "Participant_B", {
                type: "bpmn:Participant",
                isExpanded: false,
            });

            expect(exists(handle, "MessageFlow_AB")).toBe(true);
            expect(exists(handle, "MessageFlow_BA")).toBe(true);
            expect(elementOf(handle, "MessageFlow_AB").target).toBe(collapsedPool);
            expect(elementOf(handle, "MessageFlow_BA").source).toBe(collapsedPool);
        });
    },
);

describe.each(EDITABLE_SURFACES)("$name token simulation", (descriptor) => {
    let surface: EditableSurface | undefined;

    async function simulate(xml: string): Promise<EditableSurface> {
        surface = await descriptor.create(mountWithPanel(), [SimulationSupportModule]);
        await surface.loadDiagram(descriptor.tagDiagram(xml));
        surface.getService<Animation>("animation").setAnimationSpeed(50);
        surface.getService<SimulationSupport>("simulationSupport").toggleSimulation(true);
        surface.getService<{ start(): void }>("simulationTrace").start();
        return surface;
    }

    afterEach(async () => {
        await afterPaint();
        surface?.destroy();
        surface = undefined;
        removeMounts();
    });

    it("follows the triggered event of an event-based gateway", async () => {
        const handle = await simulate(SIMULATED_GATEWAY_AND_BOUNDARY_XML);
        const simulation = handle.getService<SimulationSupport>("simulationSupport");

        await trigger(simulation, "Start_G");
        const messagePathEnded = simulation.elementEnter("End_M");
        await trigger(simulation, "Catch_M");
        await within(messagePathEnded, "End_M");

        expect(simulation.getHistory()).toContain("End_M");
        expect(simulation.getHistory()).not.toContain("End_T");
    });

    it("leaves a task through its triggered boundary event", async () => {
        const handle = await simulate(SIMULATED_GATEWAY_AND_BOUNDARY_XML);
        const simulation = handle.getService<SimulationSupport>("simulationSupport");
        handle
            .getService<{ waitAtElement(element: DiagramElement): void }>("simulator")
            .waitAtElement(elementOf(handle, "Task_W"));

        await trigger(simulation, "Start_W");
        const boundaryPathEnded = simulation.elementEnter("End_B");
        await trigger(simulation, "Boundary_W");
        await within(boundaryPathEnded, "End_B");

        expect(simulation.getHistory()).not.toContain("End_W");
    });

    it("animates a message flow and starts the process it targets", async () => {
        const handle = await simulate(SIMULATED_MESSAGE_FLOW_XML);
        const simulation = handle.getService<SimulationSupport>("simulationSupport");
        const animate = vi.spyOn(handle.getService<Animation>("animation"), "animate");

        const receivingProcessEnded = simulation.elementEnter("End_B");
        await trigger(simulation, "Start_A");
        await within(receivingProcessEnded, "End_B");

        const animatedIds = animate.mock.calls.map(([connection]) => connection.id);
        expect(animatedIds).toContain("MessageFlow_1");
    });
});
