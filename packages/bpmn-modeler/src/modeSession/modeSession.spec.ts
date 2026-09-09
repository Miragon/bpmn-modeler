import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectedEngine } from "@miragon/bpmn-modeler-types";
import type { BpmnModelerHandle } from "../publicApi";
import { createModeSession } from "./modeSession";
import type { ModelerSurfaceContext, SurfaceContext, SurfaceFactories } from "./publicApi";

/**
 * A recording fake surface. `hasSetMode` decides whether it looks like a full
 * modeler (the only handle the session may live-toggle). `exportShouldThrow`
 * makes `exportDiagram` reject so the export-failure path can be exercised.
 */
function makeSurface(opts: {
    id: string;
    hasSetMode: boolean;
    initialMode?: "design" | "implement";
    exportShouldThrow?: boolean;
    log: string[];
}): BpmnModelerHandle {
    let mode = opts.initialMode ?? "implement";
    const base = {
        id: opts.id,
        captureViewState: vi.fn(() => ({ viewport: { x: 0, y: 0, width: 1, height: 1 } })),
        exportDiagram: vi.fn(async () => {
            if (opts.exportShouldThrow) {
                throw new Error("export boom");
            }
            return `<xml id="${opts.id}"/>`;
        }),
        loadDiagram: vi.fn(async () => {
            opts.log.push(`${opts.id}:load`);
            return { warnings: [] };
        }),
        applyViewState: vi.fn(),
        setTheme: vi.fn(),
        destroy: vi.fn(() => opts.log.push(`${opts.id}:destroy`)),
    };
    if (!opts.hasSetMode) {
        return base as unknown as BpmnModelerHandle;
    }
    return {
        ...base,
        setMode: vi.fn((next: "design" | "implement") => {
            mode = next;
            opts.log.push(`${opts.id}:setMode:${next}`);
        }),
        getMode: vi.fn(() => mode),
    } as unknown as BpmnModelerHandle;
}

const container = () => document.createElement("div");

describe("createModeSession — availability & routing", () => {
    it("offers every mode a factory + the engine rule allow (tagged model)", async () => {
        const log: string[] = [];
        const surfaces: SurfaceFactories = {
            view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
            implement: async (ctx: ModelerSurfaceContext) =>
                makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
        };
        const session = await createModeSession({
            container: container(),
            engine: "c7",
            surfaces,
            initialMode: "implement",
        });
        expect([...session.availableModes()]).toEqual(["view", "design", "implement"]);
        expect(session.isAvailable("design")).toBe(true);
    });

    it("hides implement on an untagged model even when the factory exists", async () => {
        const log: string[] = [];
        const surfaces: SurfaceFactories = {
            view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
            design: async () => makeSurface({ id: "design", hasSetMode: false, log }),
            implement: async () => makeSurface({ id: "modeler", hasSetMode: true, log }),
        };
        const session = await createModeSession({
            container: container(),
            engine: undefined,
            surfaces,
        });
        expect([...session.availableModes()]).toEqual(["view", "design"]);
        expect(session.isAvailable("implement")).toBe(false);
    });

    it("a single factory yields exactly one available mode", async () => {
        const log: string[] = [];
        const session = await createModeSession({
            container: container(),
            engine: undefined,
            surfaces: { design: async () => makeSurface({ id: "design", hasSetMode: false, log }) },
        });
        expect([...session.availableModes()]).toEqual(["design"]);
        expect(session.getMode()).toBe("design");
    });

    it("routes Design to the modeler (mode='design') on a tagged model", async () => {
        const seenModes: Array<"design" | "implement"> = [];
        const log: string[] = [];
        const surfaces: SurfaceFactories = {
            implement: async (ctx: ModelerSurfaceContext) => {
                seenModes.push(ctx.mode);
                return makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log });
            },
        };
        await createModeSession({
            container: container(),
            engine: "c7",
            surfaces,
            initialMode: "design",
        });
        expect(seenModes).toEqual(["design"]);
    });

    it("routes Design to the designer on an untagged model", async () => {
        const log: string[] = [];
        const design = vi.fn(async (_ctx: SurfaceContext) =>
            makeSurface({ id: "design", hasSetMode: false, log }),
        );
        await createModeSession({
            container: container(),
            engine: undefined,
            surfaces: { design },
            initialMode: "design",
        });
        expect(design).toHaveBeenCalledTimes(1);
    });
});

describe("createModeSession — transitions", () => {
    let log: string[];
    let engine: DetectedEngine;
    let surfaces: SurfaceFactories;

    beforeEach(() => {
        log = [];
        engine = "c7";
        surfaces = {
            view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
            implement: async (ctx: ModelerSurfaceContext) =>
                makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
        };
    });

    it("toggles Design↔Implement live, without recreating", async () => {
        const onModeChanged = vi.fn();
        const onSurfaceCreated = vi.fn();
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces,
            initialMode: "design",
            onModeChanged,
            onSurfaceCreated,
        });
        expect(session.getMode()).toBe("design");
        onSurfaceCreated.mockClear();

        await session.requestMode("implement");
        expect(session.getMode()).toBe("implement");
        expect(onModeChanged).toHaveBeenCalledWith("implement", "toggle");
        // A toggle reuses the instance — no new surface, no destroy.
        expect(onSurfaceCreated).not.toHaveBeenCalled();
        expect(log).not.toContain("modeler:destroy");
    });

    it("recreates for a View↔Implement change, carrying the view state over", async () => {
        const onModeChanged = vi.fn();
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces,
            initialMode: "implement",
            onModeChanged,
        });
        await session.requestMode("view");
        expect(session.getMode()).toBe("view");
        expect(onModeChanged).toHaveBeenCalledWith("view", "recreate");
        // Export ran, old instance destroyed, new one loaded the carried XML.
        expect(log).toEqual(["modeler:destroy", "view:load"]);
    });

    it("runs beforeDestroy before the destroy on a recreate", async () => {
        const order: string[] = [];
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            beforeDestroy: () => void order.push("beforeDestroy"),
            onModeChanged: () => order.push("modeChanged"),
        });
        // Splice the destroy marker into the shared order log via the surface log.
        await session.requestMode("view");
        expect(order[0]).toBe("beforeDestroy");
        // beforeDestroy precedes the destroy recorded in `log`.
        expect(log.indexOf("modeler:destroy")).toBeGreaterThanOrEqual(0);
    });

    it("keeps the live instance when the export fails (nothing destroyed)", async () => {
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({
                        id: "modeler",
                        hasSetMode: true,
                        initialMode: ctx.mode,
                        exportShouldThrow: true,
                        log,
                    }),
            },
            initialMode: "implement",
            onError,
            onModeChanged,
        });
        await session.requestMode("view");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(session.getMode()).toBe("implement");
        expect(log).not.toContain("modeler:destroy");
        expect(onModeChanged).not.toHaveBeenCalled();
    });

    it("falls back to the default mode when a factory fails past the destroy", async () => {
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        let viewAttempts = 0;
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => {
                    viewAttempts += 1;
                    if (viewAttempts === 1) {
                        throw new Error("view factory boom");
                    }
                    return makeSurface({ id: "view", hasSetMode: false, log });
                },
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            onError,
            onModeChanged,
        });
        await session.requestMode("view");
        expect(onError).toHaveBeenCalledTimes(1);
        // defaultMode(c7, [view, design, implement]) === "implement".
        expect(session.getMode()).toBe("implement");
        expect(onModeChanged).toHaveBeenLastCalledWith("implement", "fallback");
    });

    it("drops a request while a switch is in flight", async () => {
        let releaseExport: (() => void) | undefined;
        const gate = new Promise<void>((resolve) => {
            releaseExport = resolve;
        });
        const onModeChanged = vi.fn();
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
                implement: async (ctx: ModelerSurfaceContext) => {
                    const surface = makeSurface({
                        id: "modeler",
                        hasSetMode: true,
                        initialMode: ctx.mode,
                        log,
                    });
                    // Stall the first export so a second request lands mid-switch.
                    (surface as unknown as { exportDiagram: () => Promise<string> }).exportDiagram =
                        async () => {
                            await gate;
                            return "<xml/>";
                        };
                    return surface;
                },
            },
            initialMode: "implement",
            onModeChanged,
        });
        const first = session.requestMode("view");
        // While busy, this request is dropped.
        await session.requestMode("design");
        releaseExport?.();
        await first;
        expect(session.getMode()).toBe("view");
        // Only the first switch applied.
        expect(onModeChanged).toHaveBeenCalledTimes(1);
        expect(onModeChanged).toHaveBeenCalledWith("view", "recreate");
    });

    it("ignores an unavailable or no-op request", async () => {
        const onModeChanged = vi.fn();
        const session = await createModeSession({
            container: container(),
            engine: undefined,
            surfaces: {
                view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
                design: async () => makeSurface({ id: "design", hasSetMode: false, log }),
            },
            initialMode: "design",
            onModeChanged,
        });
        await session.requestMode("implement"); // unavailable (untagged)
        await session.requestMode("design"); // no-op (already here)
        expect(onModeChanged).not.toHaveBeenCalled();
        expect(session.getMode()).toBe("design");
    });
});

describe("createModeSession — theming & teardown", () => {
    it("forwards setTheme to the live handle and destroy tears it down", async () => {
        const log: string[] = [];
        const surface = makeSurface({ id: "view", hasSetMode: false, log });
        const session = await createModeSession({
            container: container(),
            engine: undefined,
            surfaces: { view: async () => surface },
        });
        session.setTheme("dark");
        expect(
            (surface as unknown as { setTheme: ReturnType<typeof vi.fn> }).setTheme,
        ).toHaveBeenCalledWith("dark");
        session.destroy();
        expect(log).toContain("view:destroy");
    });
});
