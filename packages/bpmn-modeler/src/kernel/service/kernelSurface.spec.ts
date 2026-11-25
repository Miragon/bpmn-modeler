import EventBus from "diagram-js/lib/core/EventBus";
import { Injector, type ModuleDeclaration } from "didi";
import { afterAll, afterEach, beforeAll, describe, expect, expectTypeOf, it, vi } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";
import {
    type EditableSurfaceMode,
    SURFACE_MODE_CHANGED,
    SURFACE_MODE_SERVICE,
} from "@miragon/bpmn-modeler-types/domain";

import type { BpmnFeature } from "../domain/bpmnFeature";
import { DIAGRAM_TEMPLATE, SURFACE_ROOTS } from "../domain/kernelNames";
import type {
    BpmnSurface,
    EditingSurface,
    ModalSurface,
    ModalSurfaceOptions,
    ViewingSurface,
    ViewingSurfaceServices,
} from "../port/bpmnSurface";
import type { CoreViewerServices } from "../../viewer/port/publicApi";
import type { BpmnSurfaceHandle, PendingInputHandle } from "../port/surfaceHandle";
import { KernelSurface, type KernelSurfaceOptions } from "./kernelSurface";
import { surfaceHandleOf } from "./kernelSurfaceHandle";
import { SurfaceView } from "./viewState";

/**
 * The kernel against a fake bpmn-js whose constructor runs a real didi injector,
 * so list order, later-wins and `__init__` order are didi's own. Rendering is
 * covered by `createSurface.browser.spec.ts`.
 */

const constructed: FakeViewer[] = [];

class FakeViewer {
    readonly eventBus = new EventBus();

    readonly injector: Injector;

    constructor(readonly options: { additionalModules: ModuleDeclaration[] } & object) {
        constructed.push(this);
        this.injector = new Injector([
            {
                config: ["value", options],
                eventBus: ["value", this.eventBus],
                canvas: ["value", { getContainer: () => document.createElement("div") }],
            },
            ...options.additionalModules,
        ]);
        this.injector.init();
        this.eventBus.fire("diagram.init");
    }

    get<T>(name: string, strict?: boolean): T {
        return this.injector.get<T>(name, strict as true);
    }

    destroy(): void {
        this.eventBus.fire("diagram.destroy");
    }

    importXML = vi.fn(async (_xml: string) => ({ warnings: [] }));

    async saveXML() {
        return { xml: "<definitions/>" };
    }

    async saveSVG() {
        return { svg: "<svg/>" };
    }
}
// The kernel tells a constructor from a loader by the prototype.
Object.defineProperty(FakeViewer.prototype, "importXML", { value: () => {} });

class FakeModeler extends FakeViewer {
    createDiagram = vi.fn(async () => ({ warnings: [] }));
}
Object.defineProperty(FakeModeler.prototype, "createDiagram", { value: () => {} });

function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function mount() {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    document.body.append(container, panel);
    return { container, panel };
}

function surfaceOf(
    options: Partial<KernelSurfaceOptions> = {},
    defaultModules: readonly unknown[] = [],
) {
    const { container, panel } = mount();
    const onWarning = vi.fn();
    const kernel = new KernelSurface(
        container,
        { base: FakeModeler as never, features: [], onWarning, ...options },
        defaultModules,
    );
    return { kernel, container, panel, onWarning };
}

function provider(name: string, value: unknown): BpmnFeature {
    return { id: name, modules: [{ [name]: ["value", value] }] };
}

const lastConstructed = () => constructed.at(-1)!;

// jsdom ships no matchMedia; the "automatic" theme reads it.
beforeAll(() => {
    vi.stubGlobal("matchMedia", (media: string) => ({
        matches: false,
        media,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    }));
});
afterAll(() => vi.unstubAllGlobals());

afterEach(() => {
    constructed.splice(0);
    document.body.replaceChildren();
    vi.restoreAllMocks();
});

describe("KernelSurface construction", () => {
    it("awaits an async feature before it constructs", async () => {
        const feature = deferred<BpmnFeature>();
        const { kernel } = surfaceOf({ features: [feature.promise] });

        const initialised = kernel.init();
        await Promise.resolve();
        expect(constructed).toEqual([]);

        feature.resolve(provider("late", "value"));
        await initialised;

        expect(kernel.getService("late")).toBe("value");
    });

    it("registers the kernel's modules, then the defaults, then the features, then the plugins", async () => {
        const order: string[] = [];
        const recording = (label: string) => ({
            __init__: [Object.assign(() => order.push(label), { $inject: [] })],
        });
        const { kernel } = surfaceOf(
            {
                mode: "design",
                features: [{ id: "a", modules: [recording("feature")] }],
                plugins: [{ id: "p", modules: [recording("plugin")] }],
            },
            [recording("default")],
        );

        await kernel.init();

        const modules = lastConstructed().options.additionalModules;
        expect(Object.keys(modules[0])).toEqual([SURFACE_MODE_SERVICE]);
        expect(Object.keys(modules[1])).toContain(SURFACE_ROOTS);
        expect(order).toEqual(["default", "feature", "plugin"]);
    });

    it("lets a plugin's provider win over a built-in's", async () => {
        const { kernel } = surfaceOf({
            features: [provider("shared", "built-in")],
            plugins: [provider("shared", "plugin")],
        });

        await kernel.init();

        expect(kernel.getService("shared")).toBe("plugin");
    });

    it("hands bpmn-js the merged config and moddle, with the container it owns", async () => {
        const camunda = { name: "Camunda", prefix: "camunda" };
        const { kernel, container } = surfaceOf({
            features: [
                { id: "a", modules: [], config: { minimap: { open: false } } },
                {
                    id: "b",
                    modules: [],
                    config: { minimap: { open: true } },
                    moddleExtensions: { camunda },
                },
            ],
        });

        await kernel.init();

        expect(lastConstructed().options).toMatchObject({
            container,
            minimap: { open: true },
            moddleExtensions: { camunda },
        });
    });

    it("gives any module's __init__ every root, the container first", async () => {
        const extra = document.createElement("div");
        let seen: unknown;
        const reader = Object.assign((roots: unknown) => (seen = roots), {
            $inject: [SURFACE_ROOTS],
        });
        const { kernel, container } = surfaceOf({
            extraRoots: [extra],
            features: [{ id: "reader", modules: [{ __init__: [reader] }] }],
        });

        await kernel.init();

        expect(seen).toEqual([container, extra]);
    });

    it("builds through a lazy base, as a module or as the constructor", async () => {
        for (const base of [
            () => Promise.resolve({ default: FakeViewer }),
            () => Promise.resolve(FakeViewer),
        ]) {
            const { kernel } = surfaceOf({ base: base as never });
            await kernel.init();
            expect(kernel.base).toBe("viewer");
        }
    });
});

describe("KernelSurface failures", () => {
    it("fails on a rejected built-in, naming its position and keeping the cause", async () => {
        const reason = new Error("offline");
        const { kernel, container } = surfaceOf({
            features: [provider("a", 1), Promise.reject(reason)],
        });

        const failure = await kernel.init().catch((error: Error) => error);

        expect(failure).toMatchObject({ message: "feature #2 failed to load", cause: reason });
        expect(constructed).toEqual([]);
        expect(container.childElementCount).toBe(0);
    });

    it("fails on a built-in that misses a required name, naming it", async () => {
        const { kernel } = surfaceOf({
            features: [{ id: "clipboard", modules: [], requires: ["nativeCopyPaste"] }],
        });

        await expect(kernel.init()).rejects.toThrow(
            'feature "clipboard" requires "nativeCopyPaste", which no feature provides',
        );
        expect(constructed).toEqual([]);
    });

    it("drops a rejected plugin and a plugin that misses a name, and warns once for each", async () => {
        const { kernel, onWarning } = surfaceOf({
            features: [provider("a", 1)],
            plugins: [
                Promise.reject(new Error("404")),
                { id: "needy", modules: [], requires: ["missing"] },
            ],
        });

        await kernel.init();

        expect(onWarning.mock.calls).toEqual([
            ["plugin #1 failed to load: 404; the surface is built without it"],
            [
                'plugin "needy" requires "missing", which no feature provides; the surface is built without it',
            ],
        ]);
        expect(kernel.getService("a")).toBe(1);
    });

    it("fails the whole surface when a plugin module throws while bpmn-js constructs", async () => {
        const { kernel } = surfaceOf({
            plugins: [
                {
                    id: "poison",
                    modules: [
                        {
                            __init__: [
                                Object.assign(
                                    () => {
                                        throw new Error("poison");
                                    },
                                    { $inject: [] },
                                ),
                            ],
                        },
                    ],
                },
            ],
        });

        await expect(kernel.init()).rejects.toThrow("poison");
    });

    it("fails when the base loader rejects or resolves to no bpmn-js constructor", async () => {
        const rejected = surfaceOf({ base: (() => Promise.reject(new Error("chunk"))) as never });
        await expect(rejected.kernel.init()).rejects.toThrow("the surface base failed to load");

        const wrong = surfaceOf({ base: (() => Promise.resolve({ default: {} })) as never });
        await expect(wrong.kernel.init()).rejects.toThrow("the surface base failed to load");
    });
});

describe("KernelSurface destroyed while it awaits", () => {
    it("builds nothing, marks no root and reports nothing", async () => {
        const feature = deferred<BpmnFeature>();
        const { kernel, container, panel, onWarning } = surfaceOf({
            mode: "design",
            extraRoots: [],
            features: [feature.promise],
            plugins: [Promise.reject(new Error("404"))],
        });

        const initialised = kernel.init();
        kernel.destroy();
        feature.resolve(provider("late", 1));
        await initialised;

        expect(constructed).toEqual([]);
        expect(container.hasAttribute("data-bpmn-mode")).toBe(false);
        expect(container.hasAttribute("data-bpmn-theme")).toBe(false);
        expect(panel.attributes).toHaveLength(0);
        expect(onWarning).not.toHaveBeenCalled();
        expect(() => kernel.getService("late")).toThrow(NoModelerError);
    });

    it("resolves quietly when a built-in rejects after the destroy", async () => {
        const feature = deferred<BpmnFeature>();
        const onError = vi.fn();
        const { kernel } = surfaceOf({ features: [feature.promise], onError });

        const initialised = kernel.init();
        kernel.destroy();
        feature.reject(new Error("too late"));

        await expect(initialised).resolves.toBeUndefined();
        expect(onError).not.toHaveBeenCalled();
    });

    it("builds nothing while a lazy base still loads", async () => {
        const base = deferred<unknown>();
        const { kernel } = surfaceOf({ base: (() => base.promise) as never });

        const initialised = kernel.init();
        kernel.destroy();
        base.resolve({ default: FakeModeler });
        await initialised;

        expect(constructed).toEqual([]);
    });

    it("constructs once for two overlapping init calls, and warns only for the second", async () => {
        const feature = deferred<BpmnFeature>();
        const { kernel, onWarning } = surfaceOf({
            features: [feature.promise],
            plugins: [Promise.reject(new Error("404"))],
        });

        const first = kernel.init();
        const second = kernel.init();
        feature.resolve(provider("a", 1));
        await Promise.all([first, second]);

        expect(constructed).toHaveLength(1);
        expect(onWarning).toHaveBeenCalledOnce();
    });
});

describe("KernelSurface mode", () => {
    it("registers surfaceMode only for a modeler base given a mode", async () => {
        const modal = surfaceOf({ mode: "design" });
        const modeless = surfaceOf();
        const viewer = surfaceOf({ base: FakeViewer as never, mode: "design" });

        await Promise.all([modal.kernel.init(), modeless.kernel.init(), viewer.kernel.init()]);

        expect(modal.kernel.getMode()).toBe("design");
        expect(modeless.kernel.optionalService(SURFACE_MODE_SERVICE)).toBeUndefined();
        expect(viewer.kernel.optionalService(SURFACE_MODE_SERVICE)).toBeUndefined();
        expect(viewer.onWarning).toHaveBeenCalledExactlyOnceWith(
            "mode needs a modeler base; this surface is built without one",
        );
    });

    it("warns about onModeChanged without a mode", async () => {
        const { kernel, onWarning } = surfaceOf({ onModeChanged: vi.fn() });

        await kernel.init();

        expect(onWarning).toHaveBeenCalledExactlyOnceWith(
            "onModeChanged needs a mode on a modeler base; it is never called",
        );
    });

    it("marks the roots with the mode and tells the host after lint", async () => {
        const order: string[] = [];
        const { container, panel } = mount();
        const lint = {
            __init__: [
                Object.assign(
                    (eventBus: EventBus) =>
                        eventBus.on(SURFACE_MODE_CHANGED, 500, () => {
                            order.push("lint");
                        }),
                    { $inject: ["eventBus"] },
                ),
            ],
        };
        const withLint = new KernelSurface(
            container,
            {
                base: FakeModeler as never,
                features: [{ id: "lint", modules: [lint] }],
                mode: "design",
                extraRoots: [panel],
                onModeChanged: (mode) => order.push(`host ${mode}`),
            },
            [],
        );
        await withLint.init();
        expect(container.getAttribute("data-bpmn-mode")).toBe("design");
        expect(panel.getAttribute("data-bpmn-mode")).toBe("design");

        withLint.setMode("implement");

        expect(order).toEqual(["lint", "host implement"]);
        expect(container.getAttribute("data-bpmn-mode")).toBe("implement");
        expect(panel.getAttribute("data-bpmn-mode")).toBe("implement");
        withLint.destroy();
        expect(container.hasAttribute("data-bpmn-mode")).toBe(false);
    });
});

describe("KernelSurface members", () => {
    it("opens the diagramTemplate slot's XML on newDiagram, and arms the initial fit", async () => {
        const diagramLoaded = vi.spyOn(SurfaceView.prototype, "diagramLoaded").mockReturnValue();
        const template = provider(DIAGRAM_TEMPLATE, { newDiagramXml: () => "<template/>" });
        const { kernel } = surfaceOf({ features: [template] });
        await kernel.init();

        await kernel.newDiagram();

        expect(lastConstructed().importXML).toHaveBeenCalledExactlyOnceWith("<template/>");
        expect((lastConstructed() as FakeModeler).createDiagram).not.toHaveBeenCalled();
        expect(diagramLoaded).toHaveBeenCalledOnce();
    });

    it("opens bpmn-js's empty diagram without a template", async () => {
        vi.spyOn(SurfaceView.prototype, "diagramLoaded").mockReturnValue();
        const { kernel } = surfaceOf();
        await kernel.init();

        await kernel.newDiagram();

        expect((lastConstructed() as FakeModeler).createDiagram).toHaveBeenCalledOnce();
    });

    it("themes the roots, following the colour scheme by default", async () => {
        const { kernel, container, panel } = surfaceOf({ extraRoots: [] });
        const dark = surfaceOf({ theme: "dark", extraRoots: [panel] });

        await Promise.all([kernel.init(), dark.kernel.init()]);

        // The stubbed colour scheme never matches dark.
        expect(container.getAttribute("data-bpmn-theme")).toBe("light");
        expect(dark.container.getAttribute("data-bpmn-theme")).toBe("dark");
        expect(panel.getAttribute("data-bpmn-theme")).toBe("dark");
    });

    it("disposes the first instance on a second init", async () => {
        const { kernel } = surfaceOf();
        await kernel.init();
        const first = lastConstructed();
        const destroyed = vi.spyOn(first, "destroy");

        await kernel.init();

        expect(destroyed).toHaveBeenCalledOnce();
        expect(constructed).toHaveLength(2);
    });

    it("tells command stack changes until the listener is disposed", async () => {
        const { kernel } = surfaceOf();
        await kernel.init();
        const listener = vi.fn();

        const dispose = kernel.onCommandStackChanged(listener);
        lastConstructed().eventBus.fire("commandStack.changed");
        dispose();
        lastConstructed().eventBus.fire("commandStack.changed");

        expect(listener).toHaveBeenCalledOnce();
    });
});

describe("KernelSurface handle", () => {
    it("holds only its kind's members at runtime", async () => {
        const viewer = surfaceOf({ base: FakeViewer as never });
        const editor = surfaceOf();
        const modal = surfaceOf({ mode: "implement" });
        await Promise.all([viewer.kernel.init(), editor.kernel.init(), modal.kernel.init()]);

        const viewing = surfaceHandleOf(viewer.kernel);
        const editing = surfaceHandleOf(editor.kernel);
        const modalHandle = surfaceHandleOf(modal.kernel);

        expect(viewing.base).toBe("viewer");
        expect("newDiagram" in viewing).toBe(false);
        expect("setMode" in viewing).toBe(false);
        expect(editing.base).toBe("modeler");
        expect("newDiagram" in editing).toBe(true);
        expect("setMode" in editing).toBe(false);
        expect("setMode" in modalHandle && "getMode" in modalHandle).toBe(true);
    });

    it("reads the live managers through the handle and goes dead with destroy", async () => {
        const { kernel } = surfaceOf();
        await kernel.init();
        const handle = surfaceHandleOf(kernel);

        expect(handle.viewport).toBeDefined();
        handle.destroy();

        expect(() => handle.viewport).toThrow(NoModelerError);
        expect(() => handle.getService("canvas")).toThrow(NoModelerError);
        expect(handle.hasPendingInput()).toBe(false);
    });

    it("types every handle as the published surface handle", () => {
        expectTypeOf<BpmnSurface>().toExtend<BpmnSurfaceHandle & PendingInputHandle>();
        expectTypeOf<ViewingSurface>().not.toHaveProperty("newDiagram");
        expectTypeOf<EditingSurface>().not.toHaveProperty("setMode");
        expectTypeOf<ModalSurface>().toHaveProperty("getMode");
        expectTypeOf<ViewingSurfaceServices>().toEqualTypeOf<CoreViewerServices>();
    });

    it("takes every surface option the port declares, so a new one cannot be dropped unread", () => {
        expectTypeOf<KernelSurfaceOptions>().branded.toEqualTypeOf<
            Omit<ModalSurfaceOptions, "base" | "mode" | "handleGlobalEscape"> & {
                readonly base: unknown;
                readonly mode?: EditableSurfaceMode;
            }
        >();
    });

    it("narrows a surface to its mode members by `setMode`, not by `base`", () => {
        const narrow = (surface: BpmnSurface) => {
            if (surface.base === "modeler") {
                expectTypeOf(surface).toEqualTypeOf<EditingSurface | ModalSurface>();
            }
            if ("setMode" in surface) {
                expectTypeOf(surface).toEqualTypeOf<ModalSurface>();
            }
        };
        expectTypeOf(narrow).toBeFunction();
    });
});
