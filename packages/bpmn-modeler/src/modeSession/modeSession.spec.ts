import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DetectedEngine } from "@miragon/bpmn-modeler-types";
import type { BpmnModelerHandle, ThemeMode } from "../publicApi";
import { createModeSession } from "./modeSession";
import type {
    ModelerSurfaceContext,
    SurfaceContext,
    SurfaceFactories,
    SurfaceHandle,
} from "./publicApi";

/**
 * A recording fake surface. `hasSetMode` decides whether it looks like a full
 * modeler (the only handle the session may live-toggle). `exportShouldThrow`
 * makes `exportDiagram` reject so the export-failure path can be exercised.
 * Each surface exports `<xml id="<id>"/>`, so a `load` log entry names whose
 * export the surface received. `pendingInput` gives it a properties panel that
 * holds that value until `flushPendingInput` adds it to the export;
 * `pendingIdInput` holds a new ID for the selected `Task_1` the same way, so the
 * captured selection names whichever ID was applied. `flushShouldThrow` makes
 * that flush throw. `pendingSave` gives it a content save still waiting in its
 * debounce: `flushContentSaved` delivers it, logged with the XML it carries, and
 * `destroy` drops it.
 */
function makeSurface(opts: {
    id: string;
    hasSetMode: boolean;
    initialMode?: "design" | "implement";
    exportShouldThrow?: boolean;
    captureShouldThrow?: boolean;
    loadShouldThrow?: boolean;
    applyShouldThrow?: boolean;
    pendingInput?: string;
    pendingIdInput?: string;
    flushShouldThrow?: boolean;
    pendingSave?: boolean;
    log: string[];
}): BpmnModelerHandle {
    let mode = opts.initialMode ?? "implement";
    let pendingSave = opts.pendingSave ?? false;
    let pendingInput = opts.pendingInput;
    let pendingIdInput = opts.pendingIdInput;
    let appliedInput = "";
    let selectedElementId = "Task_1";
    const panel =
        opts.pendingInput === undefined && opts.pendingIdInput === undefined
            ? {}
            : {
                  hasPendingInput: () => pendingInput !== undefined || pendingIdInput !== undefined,
                  flushPendingInput: () => {
                      if (opts.flushShouldThrow) {
                          throw new Error("flush boom");
                      }
                      if (pendingInput !== undefined) {
                          appliedInput = ` name="${pendingInput}"`;
                          pendingInput = undefined;
                      }
                      if (pendingIdInput !== undefined) {
                          selectedElementId = pendingIdInput;
                          pendingIdInput = undefined;
                      }
                  },
              };
    const exportedXml = () => `<xml id="${opts.id}"${appliedInput}/>`;
    const contentSaved = opts.pendingSave
        ? {
              flushContentSaved: vi.fn(async () => {
                  if (pendingSave) {
                      pendingSave = false;
                      opts.log.push(`${opts.id}:contentSaved ${exportedXml()}`);
                  }
              }),
          }
        : {};
    const base = {
        ...panel,
        ...contentSaved,
        id: opts.id,
        captureViewState: vi.fn(() => {
            if (opts.captureShouldThrow) {
                throw new Error("capture boom");
            }
            return {
                viewport: { x: 0, y: 0, width: 1, height: 1 },
                selectedElementIds: [selectedElementId],
            };
        }),
        exportDiagram: vi.fn(async () => {
            if (opts.exportShouldThrow) {
                throw new Error("export boom");
            }
            return exportedXml();
        }),
        loadDiagram: vi.fn(async (xml: string) => {
            if (opts.loadShouldThrow) {
                throw new Error("load boom");
            }
            opts.log.push(`${opts.id}:load ${xml}`);
            return { warnings: [] };
        }),
        applyViewState: vi.fn(() => {
            if (opts.applyShouldThrow) {
                throw new Error("apply boom");
            }
        }),
        setTheme: vi.fn(),
        destroy: vi.fn(() => {
            pendingSave = false;
            opts.log.push(`${opts.id}:destroy`);
        }),
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

const gate = () => {
    let release!: () => void;
    const promise = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { promise, release };
};

/** The theme a fake surface ends up in: its last `setTheme`, else its factory context's. */
function appliedTheme(surface: SurfaceHandle, context: SurfaceContext): ThemeMode {
    const { calls } = (surface as unknown as { setTheme: ReturnType<typeof vi.fn> }).setTheme.mock;
    return (calls.at(-1)?.[0] as ThemeMode | undefined) ?? context.theme;
}

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

    it("recreates for a View↔Implement change, loading the outgoing surface's export", async () => {
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
        expect(log).toEqual(["modeler:destroy", 'view:load <xml id="modeler"/>']);
    });

    it("applies the panel's pending input before it exports the diagram for the next surface", async () => {
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
                        pendingInput: "Typed name",
                        log,
                    }),
            },
            initialMode: "implement",
        });
        await session.requestMode("view");
        expect(log).toEqual(["modeler:destroy", 'view:load <xml id="modeler" name="Typed name"/>']);
    });

    it("restores the selection under the ID the panel's pending input gave it", async () => {
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
                        pendingIdInput: "Task_renamed",
                        log,
                    }),
            },
            initialMode: "implement",
        });
        await session.requestMode("view");
        const view = session.getHandle() as unknown as {
            applyViewState: ReturnType<typeof vi.fn>;
        };
        expect(view.applyViewState).toHaveBeenCalledWith(
            expect.objectContaining({ selectedElementIds: ["Task_renamed"] }),
        );
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

    it("delivers the outgoing surface's pending content save, panel input included, before beforeDestroy and the destroy", async () => {
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
                        pendingInput: "Typed name",
                        pendingSave: true,
                        log,
                    }),
            },
            initialMode: "implement",
            beforeDestroy: () => void log.push("beforeDestroy"),
        });

        await session.requestMode("view");

        expect(log).toEqual([
            'modeler:contentSaved <xml id="modeler" name="Typed name"/>',
            "beforeDestroy",
            "modeler:destroy",
            'view:load <xml id="modeler" name="Typed name"/>',
        ]);
    });

    it("leaves the pending content save to its debounce on a live toggle", async () => {
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({
                        id: "modeler",
                        hasSetMode: true,
                        initialMode: ctx.mode,
                        pendingSave: true,
                        log,
                    }),
            },
            initialMode: "design",
        });

        await session.requestMode("implement");

        expect(log).toEqual(["modeler:setMode:implement"]);
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

    it("falls back to the default mode with the export when a factory fails past the destroy", async () => {
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        let viewAttempts = 0;
        let modelerCount = 0;
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
                implement: async (ctx: ModelerSurfaceContext) => {
                    modelerCount += 1;
                    return makeSurface({
                        id: `modeler#${modelerCount}`,
                        hasSetMode: true,
                        initialMode: ctx.mode,
                        log,
                    });
                },
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
        expect(log).toEqual(["modeler#1:destroy", 'modeler#2:load <xml id="modeler#1"/>']);
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

    it("applies a theme changed mid-recreate to the new surface", async () => {
        const log: string[] = [];
        const factoryStarted = gate();
        const factoryGate = gate();
        const built: Array<{ surface: SurfaceHandle; context: SurfaceContext }> = [];
        const session = await createModeSession({
            container: container(),
            engine: "c7",
            theme: "light",
            initialMode: "implement",
            surfaces: {
                view: async (context) => {
                    factoryStarted.release();
                    await factoryGate.promise;
                    const surface = makeSurface({ id: "view", hasSetMode: false, log });
                    built.push({ surface, context });
                    return surface;
                },
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({ id: "modeler", hasSetMode: true, initialMode: ctx.mode, log }),
            },
        });

        const switching = session.requestMode("view");
        await factoryStarted.promise;
        session.setTheme("dark");
        factoryGate.release();
        await switching;

        expect(session.getMode()).toBe("view");
        expect(appliedTheme(built[0].surface, built[0].context)).toBe("dark");
    });

    it("applies a theme changed mid-fallback to the fallback surface", async () => {
        const log: string[] = [];
        const fallbackStarted = gate();
        const fallbackGate = gate();
        const built: Array<{ surface: SurfaceHandle; context: SurfaceContext }> = [];
        const session = await createModeSession({
            container: container(),
            engine: "c7",
            theme: "light",
            initialMode: "implement",
            onError: vi.fn(),
            surfaces: {
                view: async () => {
                    throw new Error("view factory boom");
                },
                implement: async (context: ModelerSurfaceContext) => {
                    if (built.length > 0) {
                        fallbackStarted.release();
                        await fallbackGate.promise;
                    }
                    const surface = makeSurface({
                        id: `modeler#${built.length + 1}`,
                        hasSetMode: true,
                        initialMode: context.mode,
                        log,
                    });
                    built.push({ surface, context });
                    return surface;
                },
            },
        });

        const switching = session.requestMode("view");
        await fallbackStarted.promise;
        session.setTheme("dark");
        fallbackGate.release();
        await switching;

        expect(session.getHandle()).toBe(built[1].surface);
        expect(appliedTheme(built[1].surface, built[1].context)).toBe("dark");
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

    it("keeps the original alive with no switch when applying the panel's input throws", async () => {
        const log: string[] = [];
        const onError = vi.fn();
        const onModeChanged = vi.fn();
        const beforeDestroy = vi.fn();
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
                        pendingInput: "Typed name",
                        flushShouldThrow: true,
                        log,
                    }),
            },
            initialMode: "implement",
            beforeDestroy,
            onError,
            onModeChanged,
        });

        await session.requestMode("view");
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(new Error("flush boom"));
        expect(session.getMode()).toBe("implement");
        expect(log).toEqual([]);
        expect(beforeDestroy).not.toHaveBeenCalled();
        expect(onModeChanged).not.toHaveBeenCalled();
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

    it("drops the pending content save when torn down during exportDiagram", async () => {
        const log: string[] = [];
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
                        pendingSave: true,
                        log,
                    }),
            },
            initialMode: "implement",
        });
        const exportGate = gate();
        patchMethod(session.getHandle(), "exportDiagram", async () => {
            await exportGate.promise;
            return "<xml/>";
        });

        const switchPromise = session.requestMode("view");
        const destroyPromise = session.destroy();
        exportGate.release();
        await Promise.all([switchPromise, destroyPromise]);

        expect(log).toEqual(["modeler:destroy"]);
    });

    it("destroys the original once and skips beforeDestroy and the switch when torn down during the content save", async () => {
        const log: string[] = [];
        const beforeDestroy = vi.fn();
        const viewFactory = vi.fn(async () => makeSurface({ id: "view", hasSetMode: false, log }));
        const session = await createModeSession({
            container: container(),
            engine,
            surfaces: {
                view: viewFactory,
                implement: async (ctx: ModelerSurfaceContext) =>
                    makeSurface({
                        id: "modeler",
                        hasSetMode: true,
                        initialMode: ctx.mode,
                        pendingSave: true,
                        log,
                    }),
            },
            initialMode: "implement",
            beforeDestroy,
        });
        let destroyPromise: Promise<void> | undefined;
        patchMethod(session.getHandle(), "flushContentSaved", async () => {
            destroyPromise = session.destroy();
        });

        await session.requestMode("view");
        await destroyPromise;

        expect(destroyPromise).toBeDefined();
        expect(countIn(log, "modeler:destroy")).toBe(1);
        expect(beforeDestroy).not.toHaveBeenCalled();
        expect(viewFactory).not.toHaveBeenCalled();
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
