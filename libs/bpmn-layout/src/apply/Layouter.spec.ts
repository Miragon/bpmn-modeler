import { describe, expect, it, vi } from "vitest";

import { LayoutEngineError } from "../port";
import type { LayoutEngine } from "../port";
import type { LayoutResult } from "../types";
import { LAYOUT_APPLY_COMMAND, LAYOUT_FORMATTED_EVENT, Layouter } from "./Layouter";

interface FakeElement {
    id: string;
    type: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    waypoints?: { x: number; y: number }[];
    labelTarget?: { id: string };
    businessObject?: { $type?: string };
}

function build(options: {
    elements?: FakeElement[];
    rootType?: string;
    editable?: boolean;
    engine?: Partial<LayoutEngine>;
    xml?: string | undefined;
    saveXmlRejects?: boolean;
}) {
    const elements = options.elements ?? [
        { id: "Task_1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
    ];
    const root: FakeElement = {
        id: "Process_1",
        type: "bpmn:Process",
        businessObject: { $type: options.rootType ?? "bpmn:Process" },
    };

    const commandStack = { execute: vi.fn() };
    const eventBus = { fire: vi.fn() };
    const editable = options.editable ?? true;

    const layouter = new Layouter(
        { get: () => (editable ? {} : null) } as never,
        { getRootElement: () => root } as never,
        { getAll: () => [root, ...elements] } as never,
        commandStack as never,
        eventBus as never,
        {
            computeLayout: vi.fn(async (): Promise<LayoutResult> => ({
                shapes: [],
                edges: [],
                diagnostics: [],
            })),
            ...options.engine,
        } as never,
        {
            saveXML: options.saveXmlRejects
                ? vi.fn(async () => {
                      throw new Error("export exploded");
                  })
                : vi.fn(async () => ({ xml: options.xml ?? "<xml/>" })),
        } as never,
    );

    return { layouter, commandStack, eventBus };
}

describe("Layouter.format", () => {
    it("applies the plan as one layout.apply command", async () => {
        const { layouter, commandStack } = build({
            engine: {
                computeLayout: async () => ({
                    shapes: [{ id: "Task_1", x: 400, y: 200, width: 100, height: 80 }],
                    edges: [],
                    diagnostics: [],
                }),
            },
        });

        await expect(layouter.format()).resolves.toMatchObject({ status: "formatted" });
        expect(commandStack.execute).toHaveBeenCalledOnce();
        expect(commandStack.execute).toHaveBeenCalledWith(LAYOUT_APPLY_COMMAND, {
            operations: [{ kind: "move", id: "Task_1", delta: { x: 400, y: 200 } }],
        });
    });

    it("reports 'unchanged' and touches the command stack for an already-formatted diagram", async () => {
        const { layouter, commandStack } = build({
            engine: {
                computeLayout: async () => ({
                    shapes: [{ id: "Task_1", x: 0, y: 0, width: 100, height: 80 }],
                    edges: [],
                    diagnostics: [],
                }),
            },
        });

        await expect(layouter.format()).resolves.toMatchObject({ status: "unchanged" });
        // A no-op layout.apply would still push an undo entry.
        expect(commandStack.execute).not.toHaveBeenCalled();
    });

    it("announces every outcome on the event bus, so keyboard and host report alike", async () => {
        const { layouter, eventBus } = build({
            engine: {
                computeLayout: async () => ({
                    shapes: [{ id: "Task_1", x: 400, y: 200, width: 100, height: 80 }],
                    edges: [],
                    diagnostics: [],
                }),
            },
        });

        const outcome = await layouter.format();

        expect(eventBus.fire).toHaveBeenCalledWith(LAYOUT_FORMATTED_EVENT, outcome);
    });

    it("announces a refusal too", async () => {
        const { layouter, eventBus } = build({ editable: false });

        await layouter.format();

        expect(eventBus.fire).toHaveBeenCalledWith(
            LAYOUT_FORMATTED_EVENT,
            expect.objectContaining({ status: "failed", code: "UNSUPPORTED_SURFACE" }),
        );
    });

    it("passes engine warnings through", async () => {
        const { layouter } = build({
            engine: {
                computeLayout: async () => ({
                    shapes: [],
                    edges: [],
                    diagnostics: [{ message: "Group omitted", elementId: "Group_1" }],
                }),
            },
        });

        await expect(layouter.format()).resolves.toMatchObject({
            status: "unchanged",
            diagnostics: [{ message: "Group omitted", elementId: "Group_1" }],
        });
    });

    describe("leaves the model untouched on every failure path", () => {
        it("refuses a read-only surface", async () => {
            const { layouter, commandStack } = build({ editable: false });

            await expect(layouter.format()).resolves.toMatchObject({
                status: "failed",
                code: "UNSUPPORTED_SURFACE",
            });
            expect(commandStack.execute).not.toHaveBeenCalled();
        });

        it("refuses a drilled-in subprocess plane", async () => {
            const { layouter, commandStack } = build({ rootType: "bpmn:SubProcess" });

            await expect(layouter.format()).resolves.toMatchObject({
                status: "failed",
                code: "UNSUPPORTED_DRILLDOWN",
            });
            expect(commandStack.execute).not.toHaveBeenCalled();
        });

        it("refuses an empty diagram", async () => {
            const { layouter, commandStack } = build({ elements: [] });

            await expect(layouter.format()).resolves.toMatchObject({
                status: "failed",
                code: "EMPTY_DIAGRAM",
            });
            expect(commandStack.execute).not.toHaveBeenCalled();
        });

        it("reports a failed export", async () => {
            const { layouter, commandStack } = build({ saveXmlRejects: true });

            await expect(layouter.format()).resolves.toMatchObject({
                status: "failed",
                code: "ENGINE_FAILED",
                message: "export exploded",
            });
            expect(commandStack.execute).not.toHaveBeenCalled();
        });

        it("reports an engine that threw, carrying its message", async () => {
            const { layouter, commandStack } = build({
                engine: {
                    computeLayout: async () => {
                        throw new LayoutEngineError(
                            "A sequence flow cannot cross a scope (Flow_1)",
                        );
                    },
                },
            });

            await expect(layouter.format()).resolves.toMatchObject({
                status: "failed",
                code: "ENGINE_FAILED",
                message: "A sequence flow cannot cross a scope (Flow_1)",
            });
            expect(commandStack.execute).not.toHaveBeenCalled();
        });
    });

    it("excludes labels and the root from the element count", async () => {
        const { layouter } = build({
            elements: [{ id: "Task_1_label", type: "label", labelTarget: { id: "Task_1" } }],
        });

        // Only a label is present, so the diagram counts as empty.
        await expect(layouter.format()).resolves.toMatchObject({ code: "EMPTY_DIAGRAM" });
    });

    it("snapshots the diagram before the engine runs", async () => {
        const order: string[] = [];
        const elements: FakeElement[] = [
            { id: "Task_1", type: "bpmn:Task", x: 0, y: 0, width: 100, height: 80 },
        ];
        const commandStack = { execute: vi.fn() };
        const layouter = new Layouter(
            { get: () => ({}) } as never,
            {
                getRootElement: () => ({
                    id: "Process_1",
                    type: "bpmn:Process",
                    businessObject: { $type: "bpmn:Process" },
                }),
            } as never,
            {
                getAll: () => {
                    order.push("snapshot");
                    return elements;
                },
            } as never,
            commandStack as never,
            { fire: vi.fn() } as never,
            {
                computeLayout: async () => {
                    order.push("engine");
                    return { shapes: [], edges: [], diagnostics: [] };
                },
            } as never,
            { saveXML: async () => ({ xml: "<xml/>" }) } as never,
        );

        await layouter.format();

        // The first getAll is the pre-flight count, the second the snapshot —
        // both must precede the engine call.
        expect(order.indexOf("engine")).toBe(order.length - 1);
    });
});
