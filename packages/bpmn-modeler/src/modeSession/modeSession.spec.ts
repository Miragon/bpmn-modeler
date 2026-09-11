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
    captureShouldThrow?: boolean;
    loadShouldThrow?: boolean;
    applyShouldThrow?: boolean;
    log: string[];
}): BpmnModelerHandle {
    let mode = opts.initialMode ?? "implement";
    const base = {
        id: opts.id,
        captureViewState: vi.fn(() => {
            if (opts.captureShouldThrow) {
                throw new Error("capture boom");
            }
            return { viewport: { x: 0, y: 0, width: 1, height: 1 } };
        }),
        exportDiagram: vi.fn(async () => {
            if (opts.exportShouldThrow) {
                throw new Error("export boom");
            }
            return `<xml id="${opts.id}"/>`;
        }),
        loadDiagram: vi.fn(async () => {
            if (opts.loadShouldThrow) {
                throw new Error("load boom");
            }
            opts.log.push(`${opts.id}:load`);
            return { warnings: [] };
        }),
        applyViewState: vi.fn(() => {
            if (opts.applyShouldThrow) {
                throw new Error("apply boom");
            }
        }),
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
        await session.destroy();
        expect(log).toContain("view:destroy");
    });
});

const patchMethod = <T>(handle: unknown, name: string, impl: T): void => {
    (handle as Record<string, T>)[name] = impl;
};

const countIn = (log: string[], entry: string): number =>
    log.filter((line) => line === entry).length;

describe("createModeSession — fault injection", () => {
    const engine: DetectedEngine = "c7";

    it("survives a throwing captureViewState and stays switchable (wedge regression)", async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        const onSwitchStateChanged = vi.fn();
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
                        captureShouldThrow: true,
                        log,
                    }),
            },
            initialMode: "implement",
            onError,
            onModeChanged,
            onSwitchStateChanged,
        });

        await session.requestMode("view");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(session.getMode()).toBe("implement");
        expect(log).not.toContain("modeler:destroy");
        expect(onModeChanged).not.toHaveBeenCalled();
        expect(onSwitchStateChanged).toHaveBeenLastCalledWith(false);

        // The busy flag must have been released: a follow-up request works.
        const modeler = session.getHandle() as unknown as {
            captureViewState: ReturnType<typeof vi.fn>;
        };
        modeler.captureViewState.mockReturnValue({ viewport: { x: 0, y: 0, width: 1, height: 1 } });
        await session.requestMode("view");
        expect(session.getMode()).toBe("view");
    });

    it("keeps the original alive with no fallback when beforeDestroy throws", async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        const beforeDestroy = vi.fn().mockImplementationOnce(() => {
            throw new Error("beforeDestroy boom");
        });
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            beforeDestroy,
            onError,
            onModeChanged,
        });

        await session.requestMode("view");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(session.getMode()).toBe("implement");
        expect(log).not.toContain("modeler:destroy");
        expect(onModeChanged).not.toHaveBeenCalled();

        // beforeDestroy no longer throws: the next request completes.
        await session.requestMode("view");
        expect(session.getMode()).toBe("view");
    });

    it("destroys the candidate and falls back when loadDiagram throws (leak regression)", async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        const onSwitchStateChanged = vi.fn();
        let viewCount = 0;
        let implCount = 0;
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => {
                    viewCount += 1;
                    return makeSurface({
                        id: `view#${viewCount}`,
                        hasSetMode: false,
                        loadShouldThrow: viewCount === 1,
                        log,
                    });
                },
                implement: async (ctx: ModelerSurfaceContext) => {
                    implCount += 1;
                    return makeSurface({
                        id: `modeler#${implCount}`,
                        hasSetMode: true,
                        initialMode: ctx.mode,
                        log,
                    });
                },
            },
            initialMode: "implement",
            onError,
            onModeChanged,
            onSwitchStateChanged,
        });

        await session.requestMode("view");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(countIn(log, "view#1:destroy")).toBe(1);
        expect(onModeChanged).toHaveBeenLastCalledWith("implement", "fallback");
        expect(session.getMode()).toBe("implement");
        expect(onSwitchStateChanged).toHaveBeenLastCalledWith(false);

        await session.requestMode("view");
        expect(session.getMode()).toBe("view");
    });

    it("destroys the candidate and falls back when applyViewState throws", async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        let viewCount = 0;
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => {
                    viewCount += 1;
                    return makeSurface({
                        id: `view#${viewCount}`,
                        hasSetMode: false,
                        applyShouldThrow: viewCount === 1,
                        log,
                    });
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
        expect(countIn(log, "view#1:destroy")).toBe(1);
        expect(onModeChanged).toHaveBeenLastCalledWith("implement", "fallback");
        expect(session.getMode()).toBe("implement");

        await session.requestMode("view");
        expect(session.getMode()).toBe("view");
    });

    it("destroys the candidate and falls back when onSurfaceCreated throws during recreate", async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        const onSurfaceCreated = vi.fn();
        let viewCount = 0;
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => {
                    viewCount += 1;
                    return makeSurface({ id: `view#${viewCount}`, hasSetMode: false, log });
                },
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            onError,
            onModeChanged,
            onSurfaceCreated,
        });

        // The initial surface already ran onSurfaceCreated; only the candidate throws.
        onSurfaceCreated.mockImplementationOnce(() => {
            throw new Error("onSurfaceCreated boom");
        });
        await session.requestMode("view");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(countIn(log, "view#1:destroy")).toBe(1);
        expect(onModeChanged).toHaveBeenLastCalledWith("implement", "fallback");
        expect(session.getMode()).toBe("implement");
    });

    it("reports twice and leaves no live surface when target and fallback factories both fail", async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const onSwitchStateChanged = vi.fn();
        let implCount = 0;
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => {
                    throw new Error("view factory boom");
                },
                implement: async (ctx: ModelerSurfaceContext) => {
                    implCount += 1;
                    // The initial build succeeds; the fallback build (second call) fails.
                    if (implCount === 2) {
                        throw new Error("fallback factory boom");
                    }
                    return makeSurface({
                        id: `modeler#${implCount}`,
                        hasSetMode: true,
                        initialMode: ctx.mode,
                        log,
                    });
                },
            },
            initialMode: "implement",
            onError,
            onSwitchStateChanged,
        });

        await expect(session.requestMode("view")).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledTimes(2);
        expect(countIn(log, "modeler#1:destroy")).toBe(1);
        expect(onSwitchStateChanged).toHaveBeenLastCalledWith(false);
    });
});

describe("createModeSession — destroy during a pending switch", () => {
    const engine: DetectedEngine = "c7";

    const gate = () => {
        let release!: () => void;
        const promise = new Promise<void>((resolve) => {
            release = resolve;
        });
        return { promise, release };
    };

    it("destroys the original once and skips the switch when torn down during exportDiagram", async () => {
        const log: string[] = [];
        const onModeChanged = vi.fn();
        const onSurfaceCreated = vi.fn();
        const onSwitchStateChanged = vi.fn();
        const viewFactory = vi.fn(async () => makeSurface({ id: "view", hasSetMode: false, log }));
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: viewFactory,
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            onModeChanged,
            onSurfaceCreated,
            onSwitchStateChanged,
        });
        onSurfaceCreated.mockClear();

        const exportGate = gate();
        patchMethod(session.getHandle(), "exportDiagram", async () => {
            await exportGate.promise;
            return "<xml/>";
        });

        const switchPromise = session.requestMode("view");
        const destroyPromise = session.destroy();
        exportGate.release();
        await Promise.all([switchPromise, destroyPromise]);

        expect(countIn(log, "modeler:destroy")).toBe(1);
        expect(viewFactory).not.toHaveBeenCalled();
        expect(onSurfaceCreated).not.toHaveBeenCalled();
        expect(onModeChanged).not.toHaveBeenCalled();
        expect(onSwitchStateChanged).not.toHaveBeenCalledWith(false);
    });

    it("destroys the original once and skips the switch when torn down during beforeDestroy", async () => {
        const log: string[] = [];
        const onModeChanged = vi.fn();
        const viewFactory = vi.fn(async () => makeSurface({ id: "view", hasSetMode: false, log }));
        const beforeDestroyGate = gate();
        const beforeDestroyStarted = gate();
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: viewFactory,
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            beforeDestroy: () => {
                beforeDestroyStarted.release();
                return beforeDestroyGate.promise;
            },
            onModeChanged,
        });

        const switchPromise = session.requestMode("view");
        await beforeDestroyStarted.promise;
        const destroyPromise = session.destroy();
        beforeDestroyGate.release();
        await Promise.all([switchPromise, destroyPromise]);

        expect(countIn(log, "modeler:destroy")).toBe(1);
        expect(viewFactory).not.toHaveBeenCalled();
        expect(onModeChanged).not.toHaveBeenCalled();
    });

    it("destroys both original and candidate when torn down during the target factory", async () => {
        const log: string[] = [];
        const onSurfaceCreated = vi.fn();
        const factoryGate = gate();
        const factoryStarted = gate();
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => {
                    factoryStarted.release();
                    await factoryGate.promise;
                    return makeSurface({ id: "view", hasSetMode: false, log });
                },
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            onSurfaceCreated,
        });
        onSurfaceCreated.mockClear();

        const switchPromise = session.requestMode("view");
        await factoryStarted.promise;
        const destroyPromise = session.destroy();
        factoryGate.release();
        await Promise.all([switchPromise, destroyPromise]);

        expect(countIn(log, "modeler:destroy")).toBe(1);
        expect(countIn(log, "view:destroy")).toBe(1);
        expect(onSurfaceCreated).not.toHaveBeenCalled();
    });

    it("destroys the candidate and emits no modeChanged when torn down during loadDiagram", async () => {
        const log: string[] = [];
        const onModeChanged = vi.fn();
        const onSwitchStateChanged = vi.fn();
        const loadGate = gate();
        const loadStarted = gate();
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => {
                    const surface = makeSurface({ id: "view", hasSetMode: false, log });
                    patchMethod(surface, "loadDiagram", async () => {
                        loadStarted.release();
                        await loadGate.promise;
                        return { warnings: [] };
                    });
                    return surface;
                },
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            onModeChanged,
            onSwitchStateChanged,
        });

        const switchPromise = session.requestMode("view");
        await loadStarted.promise;
        const destroyPromise = session.destroy();
        loadGate.release();
        await Promise.all([switchPromise, destroyPromise]);

        expect(countIn(log, "view:destroy")).toBe(1);
        expect(onModeChanged).not.toHaveBeenCalled();
        expect(onSwitchStateChanged).not.toHaveBeenCalledWith(false);
    });

    it("resolves destroy() only after the in-flight transaction settles", async () => {
        const log: string[] = [];
        const settled: string[] = [];
        const exportGate = gate();
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
        });
        patchMethod(session.getHandle(), "exportDiagram", async () => {
            await exportGate.promise;
            return "<xml/>";
        });

        const switchPromise = session.requestMode("view").then(() => void settled.push("switch"));
        const destroyPromise = session.destroy().then(() => void settled.push("destroy"));
        // destroy() must not resolve while the transaction is gated.
        await Promise.resolve();
        expect(settled).not.toContain("destroy");
        exportGate.release();
        await Promise.all([switchPromise, destroyPromise]);
        expect(settled).toContain("destroy");
    });
});

describe("createModeSession — disposed guards", () => {
    it("destroys the underlying handle exactly once across repeated destroy()", async () => {
        const log: string[] = [];
        const session = await createModeSession({
            container: container(),
            engine: undefined,
            surfaces: { view: async () => makeSurface({ id: "view", hasSetMode: false, log }) },
        });
        await session.destroy();
        await session.destroy();
        expect(countIn(log, "view:destroy")).toBe(1);
    });

    it("ignores requestMode and setTheme after destroy", async () => {
        const log: string[] = [];
        const onModeChanged = vi.fn();
        const session = await createModeSession({
            container: container(),
            engine: "c7",
            surfaces: {
                view: async () => makeSurface({ id: "view", hasSetMode: false, log }),
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
            initialMode: "implement",
            onModeChanged,
        });
        const handle = session.getHandle() as unknown as { setTheme: ReturnType<typeof vi.fn> };
        await session.destroy();

        await session.requestMode("view");
        session.setTheme("dark");
        expect(onModeChanged).not.toHaveBeenCalled();
        expect(handle.setTheme).not.toHaveBeenCalled();
        expect(session.getMode()).toBe("implement");
    });

    it("rejects and destroys the surface when the initial onSurfaceCreated throws", async () => {
        const log: string[] = [];
        await expect(
            createModeSession({
                container: container(),
                engine: undefined,
                surfaces: { view: async () => makeSurface({ id: "view", hasSetMode: false, log }) },
                onSurfaceCreated: () => {
                    throw new Error("initial onSurfaceCreated boom");
                },
            }),
        ).rejects.toThrow("initial onSurfaceCreated boom");
        expect(log).toContain("view:destroy");
    });
});
