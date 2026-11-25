import type BaseViewer from "bpmn-js/lib/BaseViewer";
import EventBus from "diagram-js/lib/core/EventBus";
import { Injector, type ModuleDeclaration } from "didi";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisposableStore, NoModelerError } from "@miragon/bpmn-modeler-types";

import { SURFACE_ROOTS } from "../domain/kernelNames";
import { SurfaceCore } from "./surfaceCore";

/**
 * The shared facade plumbing against a fake bpmn-js instance. The rendered
 * behaviour (fit, view-state restore, teardown residue) is covered per surface
 * by the browser contracts; this pins the core's own lifecycle rules.
 */

type Instance = Pick<BaseViewer, "get" | "destroy">;

function fakeInstance(container: HTMLElement) {
    const services: Record<string, unknown> = {
        canvas: { getContainer: () => container, focus: vi.fn(), isFocused: () => false },
        eventBus: { on: vi.fn() },
        selection: { get: () => [], select: vi.fn() },
        translate: (template: string) => template,
    };
    // Mirrors didi: a missing name resolves to null when not strict, else throws.
    const get = (name: string, strict?: boolean): unknown => {
        if (name in services) return services[name];
        if (strict === false) return null;
        throw new Error(`No provider for "${name}"!`);
    };
    return { get, destroy: vi.fn() };
}

function mount() {
    const container = document.createElement("div");
    const panel = document.createElement("div");
    document.body.append(container, panel);
    return { container, panel, core: new SurfaceCore<Instance>(container, [container, panel]) };
}

function allocate(core: SurfaceCore<Instance>, container: HTMLElement, store: DisposableStore) {
    const instance = fakeInstance(container);
    core.allocate(store, () => instance as unknown as Instance);
    return instance;
}

afterEach(() => document.body.replaceChildren());

describe("SurfaceCore", () => {
    it("clears the container and rethrows when construction fails", () => {
        const { container, core } = mount();
        container.append(document.createElement("div"));
        const failure = new Error("poison");

        expect(() =>
            core.allocate(new DisposableStore(), () => {
                throw failure;
            }),
        ).toThrow(failure);

        expect(container.childElementCount).toBe(0);
        expect(() => core.instance).toThrow(NoModelerError);
        expect(() => core.viewport).toThrow(NoModelerError);
    });

    it("destroys the instance with the store and leaves every accessor dead", () => {
        const { container, core } = mount();
        const store = new DisposableStore();
        const instance = allocate(core, container, store);

        store.dispose();
        core.releaseManagers();

        expect(instance.destroy).toHaveBeenCalledOnce();
        for (const readAccessor of [
            () => core.instance,
            () => core.viewport,
            () => core.selection,
            () => core.rootElement,
            () => core.captureViewState(),
            () => core.service("canvas"),
        ]) {
            expect(readAccessor).toThrow(NoModelerError);
        }
    });

    it("registers its roots as surfaceRoots, the canvas container first", () => {
        const { container, panel, core } = mount();

        const injector = new Injector([
            { eventBus: ["value", new EventBus()] },
            core.rootsModule() as ModuleDeclaration,
        ]);
        injector.init();

        expect(injector.get(SURFACE_ROOTS)).toEqual([container, panel]);
    });

    it("fires diagram.destroy on a construction that throws after its modules initialised", () => {
        const { core } = mount();
        const eventBus = new EventBus();
        const destroyed = vi.fn();
        eventBus.on("diagram.destroy", destroyed);
        const failure = new Error("attach poison");

        expect(() =>
            core.allocate(new DisposableStore(), () => {
                new Injector([
                    { eventBus: ["value", eventBus] },
                    core.rootsModule() as ModuleDeclaration,
                ]).init();
                throw failure;
            }),
        ).toThrow(failure);

        expect(destroyed).toHaveBeenCalledOnce();
    });

    it("rethrows the construction failure even when diagram.destroy throws too", () => {
        const { core } = mount();
        const eventBus = new EventBus();
        eventBus.on("diagram.destroy", () => {
            throw new Error("secondary");
        });
        const failure = new Error("attach poison");

        expect(() =>
            core.allocate(new DisposableStore(), () => {
                new Injector([
                    { eventBus: ["value", eventBus] },
                    core.rootsModule() as ModuleDeclaration,
                ]).init();
                throw failure;
            }),
        ).toThrow(failure);
    });

    it("runs every diagram.destroy listener and logs nothing when one throws in the teardown", () => {
        const { core } = mount();
        const eventBus = new EventBus();
        const later = vi.fn();
        eventBus.on("diagram.destroy", 2000, () => {
            throw new Error("secondary");
        });
        eventBus.on("diagram.destroy", 1000, later);
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

        try {
            expect(() =>
                core.allocate(new DisposableStore(), () => {
                    new Injector([
                        { eventBus: ["value", eventBus] },
                        core.rootsModule() as ModuleDeclaration,
                    ]).init();
                    throw new Error("attach poison");
                }),
            ).toThrow("attach poison");

            expect(later).toHaveBeenCalledOnce();
            expect(consoleError).not.toHaveBeenCalled();
        } finally {
            consoleError.mockRestore();
        }
    });

    it("does not fire diagram.destroy for an earlier instance when the next construction fails first", () => {
        const { container, core } = mount();
        const eventBus = new EventBus();
        const destroyed = vi.fn();
        eventBus.on("diagram.destroy", destroyed);
        core.allocate(new DisposableStore(), () => {
            new Injector([
                { eventBus: ["value", eventBus] },
                core.rootsModule() as ModuleDeclaration,
            ]).init();
            return fakeInstance(container) as unknown as Instance;
        });

        expect(() =>
            core.allocate(new DisposableStore(), () => {
                throw new Error("poison");
            }),
        ).toThrow("poison");

        expect(destroyed).not.toHaveBeenCalled();
    });

    it("resolves a service the instance was built without to undefined", () => {
        const { container, core } = mount();
        allocate(core, container, new DisposableStore());

        expect(core.optionalService("bpmnLintConfig")).toBeUndefined();
        expect(() => core.service("bpmnLintConfig")).toThrow('No provider for "bpmnLintConfig"!');
    });

    it("ignores setTheme once the store is disposed", () => {
        const { container, panel, core } = mount();
        const store = new DisposableStore();
        store.dispose();

        core.setTheme(store, "dark");

        expect(container.hasAttribute("data-bpmn-theme")).toBe(false);
        expect(panel.hasAttribute("data-bpmn-theme")).toBe(false);
    });

    it("rebuilds the theme on a replacement store", () => {
        const { container, panel, core } = mount();
        const firstStore = new DisposableStore();
        core.setTheme(firstStore, "dark");
        firstStore.dispose();
        expect(container.hasAttribute("data-bpmn-theme")).toBe(false);

        core.setTheme(new DisposableStore(), "dark");

        expect(container.getAttribute("data-bpmn-theme")).toBe("dark");
        expect(panel.getAttribute("data-bpmn-theme")).toBe("dark");
    });
});
