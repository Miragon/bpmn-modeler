import { afterEach, describe, expect, it, vi } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";

import { createModeler } from "./createModeler";
import { BpmnModeler } from "./modeler";
import type { ThemeMode } from "./publicApi";
import { createDesigner } from "./design/createDesigner";
import type { BpmnDesigner } from "./design/designer";
import { createViewer } from "./viewer/createViewer";
import type { BpmnViewer } from "./viewer/viewer";
import { DiffViewer } from "./viewer/diff/DiffViewer";
import { FAR_FROM_ORIGIN_XML } from "./__fixtures__/bpmnXml";
import {
    mountCanvas,
    mountWithPanel,
    removeMounts,
    settleObserver,
    trackColorSchemeListeners,
    trackDocumentListeners,
    wait,
} from "./__fixtures__/surfaceMount";

/**
 * One lifecycle contract, run against every surface (modeler, designer, viewer,
 * diff pane). It only reproduces against a real bpmn-js instance and a real
 * ResizeObserver — jsdom stands up neither — so it lives in the browser project.
 * Exhaustive per-phase init-failure coverage stays in the jsdom
 * `createSurface.spec.ts`; here each surface is exercised end to end.
 */

// A bpmn-js DI module whose service throws during construction, so the bpmn-js
// constructor inside each factory's init phase fails — the "allocation" failure.
const POISON_MODULE = {
    __init__: ["poison"],
    poison: [
        "type",
        class {
            constructor() {
                throw new Error("poison");
            }
        },
    ],
};

type Handle = { destroy(): void };

interface Mount {
    container: HTMLElement;
    panel?: HTMLElement;
    roots: HTMLElement[];
}

function mountWithPanelRoots(): Mount {
    const { container, panel } = mountWithPanel();
    return { container, panel, roots: [container, panel] };
}

interface SurfaceDescriptor {
    name: string;
    mount(): Mount;
    create(mount: Mount): Promise<Handle>;
    /** A create that fails during allocation/import, leaving the roots reusable. */
    createFailing(mount: Mount): Promise<Handle>;
    load(handle: Handle): Promise<void>;
    subscribeChannels(handle: Handle, onFire: () => void): Array<() => void>;
    /** Fires a user-driven viewbox change; absent when the surface exposes no canvas. */
    triggerViewbox?(handle: Handle): void;
    /** The diagram-js canvas; absent when the surface exposes none. */
    canvas?(handle: Handle): { resized(): void };
    /** Live-only accessors, each of which must throw once destroyed. */
    deadAccessors(handle: Handle): Array<() => unknown>;
    /** Switches the colour theme; absent when the surface has no theme setter. */
    setTheme?(handle: Handle, theme: ThemeMode): void;
}

function assertClean(roots: HTMLElement[]): void {
    for (const root of roots) {
        expect(root.querySelector(".bjs-container")).toBeNull();
        expect(root.querySelector(".canvas-focus-indicator")).toBeNull();
        expect(root.querySelector("[data-bpmn-theme]")).toBeNull();
        expect(root.querySelector("[data-bpmn-mode]")).toBeNull();
        // The container/panel roots carry the theme/mode attributes themselves.
        expect(root.hasAttribute("data-bpmn-theme")).toBe(false);
        expect(root.hasAttribute("data-bpmn-mode")).toBe(false);
    }
}

const surfaces: SurfaceDescriptor[] = [
    {
        name: "modeler",
        mount: mountWithPanelRoots,
        create: (m) =>
            createModeler(m.container, {
                engine: "c8",
                propertiesPanel: { parent: m.panel! },
            }),
        createFailing: (m) =>
            createModeler(m.container, {
                engine: "c8",
                propertiesPanel: { parent: m.panel! },
                additionalModules: [POISON_MODULE] as never,
            }),
        load: async (h) => void (await (h as BpmnModeler).loadDiagram(FAR_FROM_ORIGIN_XML)),
        subscribeChannels: (h, onFire) => [
            (h as BpmnModeler).viewport.onViewportChanged(onFire),
            (h as BpmnModeler).onCommandStackChanged(onFire),
            (h as BpmnModeler).onFormatted(onFire),
        ],
        triggerViewbox: (h) => (h as BpmnModeler).getService("canvas").zoom(2),
        canvas: (h) => (h as BpmnModeler).getService("canvas"),
        deadAccessors: (h) => [
            () => (h as BpmnModeler).viewport,
            () => (h as BpmnModeler).selection,
            () => (h as BpmnModeler).rootElement,
        ],
        setTheme: (h, theme) => (h as BpmnModeler).setTheme(theme),
    },
    {
        name: "designer",
        mount: mountWithPanelRoots,
        create: (m) => createDesigner(m.container, { propertiesPanel: { parent: m.panel! } }),
        createFailing: (m) =>
            createDesigner(m.container, {
                propertiesPanel: { parent: m.panel! },
                additionalModules: [POISON_MODULE] as never,
            }),
        load: async (h) => void (await (h as BpmnDesigner).loadDiagram(FAR_FROM_ORIGIN_XML)),
        subscribeChannels: (h, onFire) => [
            (h as BpmnDesigner).viewport.onViewportChanged(onFire),
            (h as BpmnDesigner).onCommandStackChanged(onFire),
            (h as BpmnDesigner).onFormatted(onFire),
        ],
        triggerViewbox: (h) => (h as BpmnDesigner).getService("canvas").zoom(2),
        canvas: (h) => (h as BpmnDesigner).getService("canvas"),
        deadAccessors: (h) => [
            () => (h as BpmnDesigner).viewport,
            () => (h as BpmnDesigner).selection,
            () => (h as BpmnDesigner).rootElement,
        ],
        setTheme: (h, theme) => (h as BpmnDesigner).setTheme(theme),
    },
    {
        name: "viewer",
        mount: mountWithPanelRoots,
        create: (m) => createViewer(m.container, { propertiesPanel: { parent: m.panel! } }),
        createFailing: (m) =>
            createViewer(m.container, {
                propertiesPanel: { parent: m.panel! },
                additionalModules: [POISON_MODULE] as never,
            }),
        load: async (h) => void (await (h as BpmnViewer).loadDiagram(FAR_FROM_ORIGIN_XML)),
        subscribeChannels: (h, onFire) => [(h as BpmnViewer).viewport.onViewportChanged(onFire)],
        triggerViewbox: (h) => (h as BpmnViewer).getService("canvas").zoom(2),
        canvas: (h) => (h as BpmnViewer).getService("canvas"),
        deadAccessors: (h) => [
            () => (h as BpmnViewer).viewport,
            () => (h as BpmnViewer).selection,
            () => (h as BpmnViewer).rootElement,
        ],
        setTheme: (h, theme) => (h as BpmnViewer).setTheme(theme),
    },
    {
        name: "diffViewer",
        mount: () => {
            const container = mountCanvas();
            return { container, roots: [container] };
        },
        create: async (m) => {
            const diff = new DiffViewer(m.container);
            await diff.importXML(FAR_FROM_ORIGIN_XML);
            return diff;
        },
        // Allocation cannot fail (the constructor takes no options); a malformed
        // import is the diff pane's only load-time failure.
        createFailing: async (m) => {
            const diff = new DiffViewer(m.container);
            try {
                await diff.importXML("<not-bpmn/>");
            } catch (error) {
                diff.destroy();
                throw error;
            }
            return diff;
        },
        load: () => Promise.resolve(),
        subscribeChannels: (h, onFire) => [(h as DiffViewer).onViewportChanged(onFire)],
        deadAccessors: (h) => [() => (h as DiffViewer).getViewport()],
    },
];

afterEach(removeMounts);

describe.each(surfaces)("$name lifecycle contract", (surface) => {
    it("destroys cleanly: no DOM residue, balanced listeners, dead accessors", async () => {
        const tracker = trackDocumentListeners("keydown");
        const mount = surface.mount();
        const handle = await surface.create(mount);
        await surface.load(handle);
        const disposers = surface.subscribeChannels(handle, vi.fn());
        surface.triggerViewbox?.(handle);
        await settleObserver();

        handle.destroy();

        assertClean(mount.roots);

        const { added, removed } = tracker.counts();
        expect(removed).toBe(added);
        tracker.restore();

        for (const readAccessor of surface.deadAccessors(handle)) {
            expect(readAccessor).toThrow(NoModelerError);
        }

        // Idempotent: a second destroy neither throws nor re-runs disposers.
        expect(() => handle.destroy()).not.toThrow();

        // Channel disposers stay callable after teardown.
        for (const dispose of disposers) {
            expect(() => dispose()).not.toThrow();
        }
    });

    it("fires no channel callback after destroy", async () => {
        if (!surface.triggerViewbox) {
            return;
        }
        const onFire = vi.fn();
        const mount = surface.mount();
        const handle = await surface.create(mount);
        await surface.load(handle);
        surface.subscribeChannels(handle, onFire);
        await settleObserver();
        onFire.mockClear();

        // Pan just before destroy: the self-hooked debounce must be cancelled.
        surface.triggerViewbox(handle);
        handle.destroy();
        await wait(250);

        expect(onFire).not.toHaveBeenCalled();
    });

    it("stops observing the container size once destroyed", async () => {
        if (!surface.canvas) {
            return;
        }
        const mount = surface.mount();
        const handle = await surface.create(mount);
        await surface.load(handle);
        await settleObserver();
        const resized = vi.spyOn(surface.canvas(handle), "resized");

        handle.destroy();
        mount.container.style.width = "400px";
        await settleObserver();

        expect(resized).not.toHaveBeenCalled();
    });

    it("ignores setTheme once destroyed: no theme attribute, no scheme listener", async () => {
        if (!surface.setTheme) {
            return;
        }
        const schemeListeners = trackColorSchemeListeners();
        try {
            const mount = surface.mount();
            const handle = await surface.create(mount);
            handle.destroy();

            surface.setTheme(handle, "dark");
            surface.setTheme(handle, "automatic");

            assertClean(mount.roots);
            const { added, removed } = schemeListeners.counts();
            expect(removed).toBe(added);
        } finally {
            schemeListeners.restore();
        }
    });

    it("rejects a failed create, leaves zero residue, and stays reusable", async () => {
        const mount = surface.mount();

        await expect(surface.createFailing(mount)).rejects.toThrow();
        assertClean(mount.roots);

        const handle = await surface.create(mount);
        await surface.load(handle);
        expect(() => handle.destroy()).not.toThrow();
        assertClean(mount.roots);
    });
});

describe("BpmnModeler engine stack loading", () => {
    it("allocates nothing when destroyed while its engine stack loads", async () => {
        const mount = mountWithPanelRoots();
        const modeler = new BpmnModeler(mount.container, {
            engine: "c7",
            propertiesPanel: { parent: mount.panel! },
        });

        const initialized = modeler.init();
        modeler.destroy();
        await initialized;

        assertClean(mount.roots);
        expect(() => modeler.getService("canvas")).toThrow(NoModelerError);
    });
});

describe("BpmnModeler re-entrant init", () => {
    it("keeps setTheme working after init() disposes the previous store", async () => {
        const mount = mountWithPanelRoots();
        const modeler = new BpmnModeler(mount.container, {
            engine: "c8",
            propertiesPanel: { parent: mount.panel! },
        });
        await modeler.init();
        modeler.setTheme("dark");

        await modeler.init();
        modeler.setTheme("dark");

        for (const root of mount.roots) {
            expect(root.getAttribute("data-bpmn-theme")).toBe("dark");
        }
        modeler.destroy();
        assertClean(mount.roots);
    });
});
