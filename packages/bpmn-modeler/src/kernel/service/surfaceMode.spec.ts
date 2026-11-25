import EventBus from "diagram-js/lib/core/EventBus";
import { Injector } from "didi";
import { describe, expect, it, vi } from "vitest";
import { DisposableStore } from "@miragon/bpmn-modeler-types";
import {
    SURFACE_MODE_CHANGED,
    SURFACE_MODE_SERVICE,
    type SurfaceModeChangedEvent,
} from "@miragon/bpmn-modeler-types/domain";

import { MODE_ATTRIBUTE } from "../domain/surfaceMode";
import {
    createSurfaceModeModule,
    KernelSurfaceMode,
    markModeRoots,
    subscribeModeChanged,
} from "./surfaceMode";

function surfaceModeOn(eventBus: EventBus, initial: "design" | "implement") {
    const seen: string[] = [];
    eventBus.on(SURFACE_MODE_CHANGED, (event: SurfaceModeChangedEvent) => {
        seen.push(event.mode);
    });
    return { surfaceMode: new KernelSurfaceMode(eventBus, initial), seen };
}

describe("KernelSurfaceMode", () => {
    it("holds the mode the surface opened in", () => {
        const { surfaceMode, seen } = surfaceModeOn(new EventBus(), "design");

        expect(surfaceMode.get()).toBe("design");
        expect(seen).toEqual([]);
    });

    it("announces a change once, with the new mode already held", () => {
        const eventBus = new EventBus();
        const { surfaceMode, seen } = surfaceModeOn(eventBus, "implement");
        const heldWhileAnnounced: string[] = [];
        eventBus.on(SURFACE_MODE_CHANGED, 2000, () => {
            heldWhileAnnounced.push(surfaceMode.get());
        });

        expect(surfaceMode.set("design")).toBe(true);

        expect(seen).toEqual(["design"]);
        expect(heldWhileAnnounced).toEqual(["design"]);
        expect(surfaceMode.get()).toBe("design");
    });

    it("announces nothing when asked for the mode it holds", () => {
        const { surfaceMode, seen } = surfaceModeOn(new EventBus(), "implement");

        expect(surfaceMode.set("implement")).toBe(false);

        expect(seen).toEqual([]);
    });

    it("returns only after every listener, whatever its priority", () => {
        const eventBus = new EventBus();
        const { surfaceMode } = surfaceModeOn(eventBus, "implement");
        const order: string[] = [];
        eventBus.on(SURFACE_MODE_CHANGED, 1, () => {
            order.push("lowest listener");
        });

        surfaceMode.set("design");
        order.push("returned");

        expect(order).toEqual(["lowest listener", "returned"]);
    });
});

describe("createSurfaceModeModule", () => {
    it("registers the mode under its DI name, built on first lookup", () => {
        const module = createSurfaceModeModule("design");
        const injector = new Injector([
            { eventBus: ["type", EventBus] },
            module as unknown as Record<string, unknown[]>,
        ]);

        expect(Object.keys(module)).toEqual([SURFACE_MODE_SERVICE]);
        expect(injector.get<KernelSurfaceMode>(SURFACE_MODE_SERVICE).get()).toBe("design");
        expect(injector.get(SURFACE_MODE_SERVICE)).toBe(injector.get(SURFACE_MODE_SERVICE));
    });
});

describe("subscribeModeChanged", () => {
    it("tells the host after the listeners at 1000 (filter, attribute) and 500 (lint)", () => {
        const eventBus = new EventBus();
        const { surfaceMode } = surfaceModeOn(eventBus, "implement");
        const order: string[] = [];
        subscribeModeChanged(eventBus as never, (mode) => order.push(`host ${mode}`));
        eventBus.on(SURFACE_MODE_CHANGED, 500, () => {
            order.push("lint");
        });
        eventBus.on(SURFACE_MODE_CHANGED, () => {
            order.push("filter");
        });

        surfaceMode.set("design");

        expect(order).toEqual(["filter", "lint", "host design"]);
    });

    it("stops telling the host once disposed", () => {
        const eventBus = new EventBus();
        const { surfaceMode } = surfaceModeOn(eventBus, "implement");
        const host = vi.fn();

        subscribeModeChanged(eventBus as never, host)();
        surfaceMode.set("design");

        expect(host).not.toHaveBeenCalled();
    });
});

describe("markModeRoots", () => {
    it("marks every root with the mode until the store is disposed", () => {
        const roots = [document.createElement("div"), document.createElement("div")];
        const store = new DisposableStore();

        markModeRoots(store, roots, "design");
        expect(roots.map((root) => root.getAttribute(MODE_ATTRIBUTE))).toEqual([
            "design",
            "design",
        ]);

        store.dispose();
        expect(roots.some((root) => root.hasAttribute(MODE_ATTRIBUTE))).toBe(false);
    });
});
