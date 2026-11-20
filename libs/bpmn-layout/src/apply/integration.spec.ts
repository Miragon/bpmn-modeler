// @vitest-environment jsdom
import { type CleanupOutcome, polylineMidpoint } from "@miragon/bpmn-modeler-types";
import Modeler from "bpmn-js/lib/Modeler";
import { beforeAll, describe, expect, it } from "vitest";

import { indexModelElements } from "../cleanup/rules";
import type { ModdleNode } from "../cleanup/rules";
import { COLLAPSED_SUBPROCESS } from "../__fixtures__/collapsedSubprocess";
import {
    LABELLED_EVENTS,
    LABELLED_FLOW_WITH_REDUNDANT_BEND,
    MESSY_LANES_BOUNDARY_SUBPROCESS,
} from "../__fixtures__/integrationDiagrams";
import { installHeadlessDom } from "../__fixtures__/headlessDom";
import { parseDefinitions } from "../__fixtures__/parseBpmn";
import { createBpmnLayoutModule } from "../module";
import type { LayoutEngine } from "../port";
import type { LayoutResult, Point } from "../types";
import { LAYOUT_APPLY_COMMAND } from "./Layouter";
import type { LayoutOutcome } from "./Layouter";

/**
 * Formatting driven through a real `bpmn-js` modeler.
 *
 * The unit tests around this one assert the arguments handed to `modeling`,
 * which keeps passing whether or not bpmn-js honours them. These assert what
 * was actually promised: geometry moves, semantics do not, and one undo puts
 * everything back.
 */

interface Geometry {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    waypoints?: { x: number; y: number }[];
}

/**
 * The slice of a diagram-js element these assertions read. Bounds are required
 * because every shape carries them; a connection is distinguished by
 * `waypoints`, which every reader here checks first.
 */
interface DiagramElement {
    id: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    waypoints?: { x: number; y: number }[];
    parent?: DiagramElement;
    host?: DiagramElement;
    labelTarget?: DiagramElement;
    businessObject?: { attachedToRef?: { id: string } };
}

interface Registry {
    get(id: string): DiagramElement;
    getAll(): DiagramElement[];
}

type GeometryMap = Record<string, Geometry>;

function round(value: number): number {
    return Math.round(value * 100) / 100;
}

/** Every element's bounds and waypoints, as bpmn-js currently holds them. */
function geometryOf(modeler: Modeler): GeometryMap {
    const registry = modeler.get("elementRegistry") as Registry;

    const geometry: GeometryMap = {};
    for (const element of registry.getAll()) {
        geometry[element.id] = element.waypoints
            ? { waypoints: element.waypoints.map((p) => ({ x: round(p.x), y: round(p.y) })) }
            : {
                  x: round(element.x ?? 0),
                  y: round(element.y ?? 0),
                  width: round(element.width ?? 0),
                  height: round(element.height ?? 0),
              };
    }
    return geometry;
}

/**
 * A stable projection of everything that is *not* geometry: types, containment
 * and every reference. Formatting must leave this identical, and comparing it
 * is what makes "semantics preserved" a test rather than a claim.
 *
 * Reference collections are sorted because their order carries no meaning —
 * `flowNodeRef` is a set, and moving a boundary event does re-append it to its
 * lane. Membership is the guarantee, and it is asserted separately.
 */
function semanticDigest(definitions: ModdleNode): string[] {
    const refs = (node: ModdleNode, property: string): string => {
        const value = node[property];
        if (value === undefined || value === null) return "";
        const items = Array.isArray(value) ? value : [value];
        return items
            .map((item) => (typeof item === "string" ? item : ((item as ModdleNode)?.id ?? "?")))
            .sort()
            .join(",");
    };

    return [...indexModelElements(definitions).values()]
        .map((node) =>
            [
                node.id,
                node.$type,
                `name=${typeof node.name === "string" ? node.name : ""}`,
                `parent=${(node.$parent as ModdleNode | undefined)?.id ?? ""}`,
                `source=${refs(node, "sourceRef")}`,
                `target=${refs(node, "targetRef")}`,
                `attachedTo=${refs(node, "attachedToRef")}`,
                `flowNodes=${refs(node, "flowNodeRef")}`,
                `incoming=${refs(node, "incoming")}`,
                `outgoing=${refs(node, "outgoing")}`,
            ].join("|"),
        )
        .sort();
}

async function digestOf(modeler: Modeler): Promise<string[]> {
    const { xml } = await modeler.saveXML({ format: false });
    return semanticDigest(await parseDefinitions(xml as string));
}

async function openModeler(diagram: string, engine?: LayoutEngine) {
    const container = document.createElement("div");
    document.body.appendChild(container);

    const modeler = new Modeler({
        container,
        additionalModules: [createBpmnLayoutModule(engine)],
    });
    await modeler.importXML(diagram);

    return {
        modeler,
        commandStack: modeler.get("commandStack") as {
            undo(): void;
            redo(): void;
            canUndo(): boolean;
            canRedo(): boolean;
            execute(command: string, context: unknown): void;
        },
        format: () =>
            (modeler.get("bpmnLayouter") as { format(): Promise<LayoutOutcome> }).format(),
        cleanup: () => (modeler.get("bpmnCleanup") as { apply(): CleanupOutcome }).apply(),
    };
}

beforeAll(() => {
    installHeadlessDom();
});

describe("formatting a real diagram", () => {
    it("moves shapes and reroutes connections", async () => {
        const { modeler, format } = await openModeler(MESSY_LANES_BOUNDARY_SUBPROCESS);
        const before = geometryOf(modeler);

        await expect(format()).resolves.toMatchObject({ status: "formatted" });

        const after = geometryOf(modeler);
        expect(after).not.toEqual(before);
        expect(after.Task_after).not.toEqual(before.Task_after);
        expect(after.Flow_1).not.toEqual(before.Flow_1);
    });

    it("leaves the model semantics untouched", async () => {
        const { modeler, format } = await openModeler(MESSY_LANES_BOUNDARY_SUBPROCESS);
        const before = await digestOf(modeler);

        await format();

        expect(await digestOf(modeler)).toEqual(before);
    });

    it("keeps lane membership", async () => {
        const { modeler, format } = await openModeler(MESSY_LANES_BOUNDARY_SUBPROCESS);

        await format();

        const { xml } = await modeler.saveXML({ format: false });
        const index = indexModelElements(await parseDefinitions(xml as string));
        const lane = index.get("Lane_1") as ModdleNode;

        expect((lane.flowNodeRef as ModdleNode[]).map((ref) => ref.id).sort()).toEqual([
            "Boundary_1",
            "End_1",
            "Gateway_1",
            "Start_1",
            "Sub_1",
            "Task_after",
        ]);
    });

    it("keeps a boundary event attached to its host and on its border", async () => {
        const { modeler, format } = await openModeler(MESSY_LANES_BOUNDARY_SUBPROCESS);

        await format();

        const registry = modeler.get("elementRegistry") as Registry;
        const boundary = registry.get("Boundary_1");
        const host = registry.get("Sub_1");

        expect(boundary.host?.id).toBe("Sub_1");
        expect(boundary.businessObject?.attachedToRef?.id).toBe("Sub_1");

        // Its centre must still sit on the host's outline, not float away.
        const centreX = boundary.x + boundary.width / 2;
        const centreY = boundary.y + boundary.height / 2;
        expect(centreX).toBeGreaterThanOrEqual(host.x - 1);
        expect(centreX).toBeLessThanOrEqual(host.x + host.width + 1);
        expect(centreY).toBeGreaterThanOrEqual(host.y - 1);
        expect(centreY).toBeLessThanOrEqual(host.y + host.height + 1);
    });

    it("keeps subprocess children inside their parent", async () => {
        const { modeler, format } = await openModeler(MESSY_LANES_BOUNDARY_SUBPROCESS);

        await format();

        const registry = modeler.get("elementRegistry") as Registry;
        const sub = registry.get("Sub_1");

        for (const id of ["SubStart_1", "SubTask_1"]) {
            const child = registry.get(id);
            expect(child.parent?.id).toBe("Sub_1");
            expect(child.x).toBeGreaterThanOrEqual(sub.x);
            expect(child.y).toBeGreaterThanOrEqual(sub.y);
            expect(child.x + child.width).toBeLessThanOrEqual(sub.x + sub.width);
            expect(child.y + child.height).toBeLessThanOrEqual(sub.y + sub.height);
        }
    });

    it("keeps external labels attached to their target", async () => {
        const { modeler, format } = await openModeler(MESSY_LANES_BOUNDARY_SUBPROCESS);

        await format();

        const registry = modeler.get("elementRegistry") as Registry;
        const labels = registry.getAll().filter((element) => element.type === "label");

        expect(labels.length).toBeGreaterThan(0);
        for (const label of labels) {
            expect(label.labelTarget).toBeDefined();
            expect(registry.getAll()).toContain(label.labelTarget);
        }
    });
});

describe("formatting and the command stack", () => {
    it("is undone by a single undo", async () => {
        const { modeler, commandStack, format } = await openModeler(
            MESSY_LANES_BOUNDARY_SUBPROCESS,
        );
        const before = geometryOf(modeler);

        await format();
        expect(geometryOf(modeler)).not.toEqual(before);

        commandStack.undo();

        // One undo, not one per moved element.
        expect(geometryOf(modeler)).toEqual(before);
        expect(commandStack.canUndo()).toBe(false);
    });

    it("is put back by a single redo", async () => {
        const { modeler, commandStack, format } = await openModeler(
            MESSY_LANES_BOUNDARY_SUBPROCESS,
        );

        await format();
        const formatted = geometryOf(modeler);
        commandStack.undo();
        commandStack.redo();

        expect(geometryOf(modeler)).toEqual(formatted);
        expect(commandStack.canRedo()).toBe(false);
    });

    it("survives an undo/redo round trip with its semantics intact", async () => {
        const { modeler, commandStack, format } = await openModeler(
            MESSY_LANES_BOUNDARY_SUBPROCESS,
        );
        const before = await digestOf(modeler);

        await format();
        commandStack.undo();
        commandStack.redo();

        expect(await digestOf(modeler)).toEqual(before);
    });
});

/**
 * The applier's hints, driven with a hand-built plan.
 *
 * A plan is used directly here because the engine never produces the case:
 * `computeLayoutPlan` emits a `resize` whenever a shape's size changed, and
 * bpmn-auto-layout resizes every container it touches — so a container that
 * *only moves* is reachable in principle but not from this engine's output.
 * The guard still has to hold, since it is the plan shape that decides, not
 * the engine that happened to produce it.
 */
describe("applying a plan through the real command stack", () => {
    it("moves a child once when its parent moves too", async () => {
        const { modeler, commandStack } = await openModeler(MESSY_LANES_BOUNDARY_SUBPROCESS);
        const registry = modeler.get("elementRegistry") as Registry;
        const childBefore = { ...registry.get("SubTask_1") };

        // Every delta in a plan is measured against the pre-batch snapshot, so
        // a child carried along by its parent would land twice.
        commandStack.execute(LAYOUT_APPLY_COMMAND, {
            operations: [
                { kind: "move", id: "Sub_1", delta: { x: 100, y: 0 } },
                { kind: "move", id: "SubTask_1", delta: { x: 50, y: 0 } },
            ],
        });

        expect(registry.get("SubTask_1").x).toBe(childBefore.x + 50);
    });

    it("keeps the waypoints it was given instead of rerouting them", async () => {
        const { modeler, commandStack } = await openModeler(MESSY_LANES_BOUNDARY_SUBPROCESS);
        const registry = modeler.get("elementRegistry") as Registry;
        const waypoints = [
            { x: 200, y: 200 },
            { x: 260, y: 260 },
            { x: 320, y: 200 },
        ];

        commandStack.execute(LAYOUT_APPLY_COMMAND, {
            operations: [{ kind: "waypoints", id: "Flow_1", waypoints }],
        });

        expect(
            registry.get("Flow_1").waypoints?.map((point) => ({ x: point.x, y: point.y })),
        ).toEqual(waypoints);
    });
});

function positionOf(registry: Registry, id: string): Point {
    const { x, y } = registry.get(id);
    return { x, y };
}

/**
 * Labels, formatted by `bpmnLayouter` against an engine that answers with a
 * fixed target: each lands once, at the offset the user gave it from its flow
 * or shape.
 */
describe("moving labels through the real command stack", () => {
    function shift(from: Point, to: Point): Point {
        return { x: to.x - from.x, y: to.y - from.y };
    }

    async function openLabelledEvents() {
        let target: LayoutResult = { shapes: [], edges: [], diagnostics: [] };
        const engine: LayoutEngine = { computeLayout: async () => target };
        const { modeler, format } = await openModeler(LABELLED_EVENTS, engine);
        return {
            registry: modeler.get("elementRegistry") as Registry,
            format: async (laidOut: Partial<LayoutResult>) => {
                target = { ...target, ...laidOut };
                expect((await format()).status).toBe("formatted");
            },
        };
    }

    it("moves a rerouted flow's label once, by its midpoint's shift", async () => {
        const { registry, format } = await openLabelledEvents();
        const labelBefore = positionOf(registry, "Flow_1_label");
        const midpointBefore = polylineMidpoint(registry.get("Flow_1").waypoints ?? []);
        const waypoints = [
            { x: 136, y: 118 },
            { x: 200, y: 118 },
            { x: 200, y: 300 },
            { x: 415, y: 300 },
            { x: 415, y: 133 },
        ];

        await format({ edges: [{ id: "Flow_1", waypoints }] });

        const midpointShift = shift(midpointBefore, polylineMidpoint(waypoints));
        expect(positionOf(registry, "Flow_1_label")).toEqual({
            x: labelBefore.x + midpointShift.x,
            y: labelBefore.y + midpointShift.y,
        });
    });

    it("moves a moved event's label once, by the event's shift", async () => {
        const { registry, format } = await openLabelledEvents();
        const labelBefore = positionOf(registry, "Start_1_label");

        await format({ shapes: [{ id: "Start_1", x: 140, y: 300, width: 36, height: 36 }] });

        expect(positionOf(registry, "Start_1_label")).toEqual({
            x: labelBefore.x + 40,
            y: labelBefore.y + 200,
        });
    });

    it("moves a resized event's label once, keeping it centred below the event", async () => {
        const { registry, format } = await openLabelledEvents();
        const label = registry.get("End_1_label");
        const event = registry.get("End_1");
        const gapBefore = label.y - (event.y + event.height);
        const centreOffsetBefore = label.x + label.width / 2 - (event.x + event.width / 2);

        await format({ shapes: [{ id: "End_1", x: 440, y: 303, width: 36, height: 36 }] });

        expect(label.y - (event.y + event.height)).toBe(gapBefore);
        expect(label.x + label.width / 2 - (event.x + event.width / 2)).toBe(centreOffsetBefore);
    });
});

describe("tidying waypoints through the real command stack", () => {
    it("leaves a flow's label in place when a redundant bend goes", async () => {
        const { modeler, cleanup } = await openModeler(LABELLED_FLOW_WITH_REDUNDANT_BEND);
        const registry = modeler.get("elementRegistry") as Registry;
        const labelBefore = positionOf(registry, "Flow_1_label");

        expect(cleanup().status).toBe("applied");

        expect(registry.get("Flow_1").waypoints).toHaveLength(2);
        expect(positionOf(registry, "Flow_1_label")).toEqual(labelBefore);
    });
});

/**
 * Drilling into a collapsed subprocess used to be refused outright.
 *
 * The refusal was a limit of the pre-flight check, not of the operation: the
 * element registry holds every plane's elements no matter which one is open,
 * so the snapshot and the plan are as complete from inside a subprocess as
 * from the top level.
 */
describe("formatting from inside a collapsed subprocess", () => {
    async function drillIn() {
        const opened = await openModeler(COLLAPSED_SUBPROCESS);
        const canvas = opened.modeler.get("canvas") as {
            findRoot(id: string): unknown;
            setRootElement(root: unknown): void;
            getRootElement(): { id: string };
        };

        canvas.setRootElement(canvas.findRoot("Sub_1_plane"));
        expect(canvas.getRootElement().id).toBe("Sub_1_plane");

        return opened;
    }

    it("formats instead of refusing", async () => {
        const { format } = await drillIn();

        await expect(format()).resolves.toMatchObject({ status: "formatted" });
    });

    it("lays out the plane the user is looking at", async () => {
        const { modeler, format } = await drillIn();
        const before = geometryOf(modeler);

        await format();

        const after = geometryOf(modeler);
        expect(after.SubTask_1).not.toEqual(before.SubTask_1);
        expect(after.SubStart_1).not.toEqual(before.SubStart_1);
    });

    it("leaves the semantics of every plane untouched", async () => {
        const { modeler, format } = await drillIn();
        const before = await digestOf(modeler);

        await format();

        expect(await digestOf(modeler)).toEqual(before);
    });

    it("is still a single undo", async () => {
        const { modeler, commandStack, format } = await drillIn();
        const before = geometryOf(modeler);

        await format();
        commandStack.undo();

        expect(geometryOf(modeler)).toEqual(before);
        expect(commandStack.canUndo()).toBe(false);
    });
});
