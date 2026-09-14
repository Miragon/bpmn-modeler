import { afterEach, describe, expect, it, vi } from "vitest";
import { NoModelerError } from "@miragon/bpmn-modeler-types";

import { createModeler } from "./createModeler";
import type { BpmnModeler } from "./modeler";
import { createDesigner } from "./design/createDesigner";
import type { BpmnDesigner } from "./design/designer";
import { createViewer } from "./viewer/createViewer";
import type { BpmnViewer } from "./viewer/viewer";
import { DiffViewer } from "./viewer/diff/DiffViewer";

/**
 * One lifecycle contract, run against every surface (modeler, designer, viewer,
 * diff pane). It only reproduces against a real bpmn-js instance and a real
 * ResizeObserver — jsdom stands up neither — so it lives in the browser project.
 * Exhaustive per-phase init-failure coverage stays in the jsdom
 * `createSurface.spec.ts`; here each surface is exercised end to end.
 */

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" id="Definitions_1" targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1" />
    <bpmn:task id="Task_1" name="A" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="5000" y="4000" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_1_di" bpmnElement="Task_1">
        <dc:Bounds x="5100" y="3980" width="100" height="80" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;

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
    panelParent?: HTMLElement;
    roots: HTMLElement[];
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
    /** Reads a live-only accessor, which must throw once destroyed. */
    probeDead(handle: Handle): void;
}

const raf = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function settleObserver(): Promise<void> {
    for (let i = 0; i < 6; i++) {
        await raf();
    }
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const openMounts: HTMLElement[] = [];

function el(width = 800, height = 600): HTMLElement {
    const node = document.createElement("div");
    node.style.width = `${width}px`;
    node.style.height = `${height}px`;
    node.style.position = "absolute";
    document.body.appendChild(node);
    openMounts.push(node);
    return node;
}

function mountWithPanel(): Mount {
    const container = el();
    const panelParent = el(300, 600);
    return { container, panelParent, roots: [container, panelParent] };
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

function trackDocumentKeydown() {
    const originalAdd = document.addEventListener.bind(document);
    const originalRemove = document.removeEventListener.bind(document);
    let added = 0;
    let removed = 0;
    document.addEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === "keydown") added++;
        return (originalAdd as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof document.addEventListener;
    document.removeEventListener = ((type: string, ...rest: unknown[]) => {
        if (type === "keydown") removed++;
        return (originalRemove as (...a: unknown[]) => void)(type, ...rest);
    }) as typeof document.removeEventListener;
    return {
        counts: () => ({ added, removed }),
        restore: () => {
            document.addEventListener = originalAdd;
            document.removeEventListener = originalRemove;
        },
    };
}

const surfaces: SurfaceDescriptor[] = [
    {
        name: "modeler",
        mount: mountWithPanel,
        create: (m) =>
            createModeler(m.container, {
                engine: "c8",
                propertiesPanel: { parent: m.panelParent! },
            }),
        createFailing: (m) =>
            createModeler(m.container, {
                engine: "c8",
                propertiesPanel: { parent: m.panelParent! },
                additionalModules: [POISON_MODULE] as never,
            }),
        load: async (h) => void (await (h as BpmnModeler).loadDiagram(XML)),
        subscribeChannels: (h, onFire) => [
            (h as BpmnModeler).viewport.onViewportChanged(onFire),
            (h as BpmnModeler).onCommandStackChanged(onFire),
        ],
        triggerViewbox: (h) => (h as BpmnModeler).getService("canvas").zoom(2),
        probeDead: (h) => void (h as BpmnModeler).viewport,
    },
    {
        name: "designer",
        mount: mountWithPanel,
        create: (m) => createDesigner(m.container, { propertiesPanel: { parent: m.panelParent! } }),
        createFailing: (m) =>
            createDesigner(m.container, {
                propertiesPanel: { parent: m.panelParent! },
                additionalModules: [POISON_MODULE] as never,
            }),
        load: async (h) => void (await (h as BpmnDesigner).loadDiagram(XML)),
        subscribeChannels: (h, onFire) => [(h as BpmnDesigner).viewport.onViewportChanged(onFire)],
        triggerViewbox: (h) => (h as BpmnDesigner).getService("canvas").zoom(2),
        probeDead: (h) => void (h as BpmnDesigner).viewport,
    },
    {
        name: "viewer",
        mount: mountWithPanel,
        create: (m) => createViewer(m.container, { propertiesPanel: { parent: m.panelParent! } }),
        createFailing: (m) =>
            createViewer(m.container, {
                propertiesPanel: { parent: m.panelParent! },
                additionalModules: [POISON_MODULE] as never,
            }),
        load: async (h) => void (await (h as BpmnViewer).loadDiagram(XML)),
        subscribeChannels: (h, onFire) => [(h as BpmnViewer).viewport.onViewportChanged(onFire)],
        triggerViewbox: (h) => (h as BpmnViewer).getService("canvas").zoom(2),
        probeDead: (h) => void (h as BpmnViewer).viewport,
    },
    {
        name: "diffViewer",
        mount: () => {
            const container = el();
            return { container, roots: [container] };
        },
        create: async (m) => {
            const diff = new DiffViewer(m.container);
            await diff.importXML(XML);
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
        probeDead: (h) => void (h as DiffViewer).getViewport(),
    },
];

afterEach(() => {
    for (const node of openMounts.splice(0)) {
        node.remove();
    }
});

describe.each(surfaces)("$name lifecycle contract", (surface) => {
    it("destroys cleanly: no DOM residue, balanced listeners, dead accessors", async () => {
        const tracker = trackDocumentKeydown();
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

        expect(() => surface.probeDead(handle)).toThrow(NoModelerError);

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
