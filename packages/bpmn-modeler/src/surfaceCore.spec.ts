import type BaseViewer from "bpmn-js/lib/BaseViewer";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisposableStore, NoModelerError } from "@miragon/bpmn-modeler-types";

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
    core.allocate(store, () => instance as unknown as Instance, { hasSearchPad: false });
    return instance;
}

afterEach(() => document.body.replaceChildren());

describe("SurfaceCore", () => {
    it("clears the container and rethrows when construction fails", () => {
        const { container, core } = mount();
        container.append(document.createElement("div"));
        const failure = new Error("poison");

        expect(() =>
            core.allocate(
                new DisposableStore(),
                () => {
                    throw failure;
                },
                { hasSearchPad: false },
            ),
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
