import { describe, expect, it, vi } from "vitest";

import { LAYOUT_FORMATTED_EVENT } from "./Layouter";
import {
    cleanupSurfaceDiagram,
    formatSurfaceDiagram,
    hasSurfaceLayout,
    subscribeFormatted,
} from "./surfaceLayout";

function injectorWith(services: Record<string, unknown>) {
    return {
        get<T>(name: string, strict = true): T | null {
            if (!(name in services)) {
                if (strict) throw new Error(`No provider for "${name}"!`);
                return null;
            }
            return services[name] as T;
        },
    };
}

describe("hasSurfaceLayout", () => {
    it("tells a surface built with the layout module from one without", () => {
        expect(hasSurfaceLayout(injectorWith({ bpmnLayouter: {} }))).toBe(true);
        expect(hasSurfaceLayout(injectorWith({}))).toBe(false);
    });
});

describe("formatSurfaceDiagram", () => {
    it("formats through the surface's layouter", async () => {
        const formatted = { status: "formatted", diagnostics: [] };
        const injector = injectorWith({ bpmnLayouter: { format: vi.fn(async () => formatted) } });

        await expect(formatSurfaceDiagram(injector)).resolves.toBe(formatted);
    });

    it("reports a failure, not a throw, on a surface built without the layout module", async () => {
        await expect(formatSurfaceDiagram(injectorWith({}))).resolves.toEqual({
            status: "failed",
            message: "this surface was created without the layout module",
            diagnostics: [],
        });
    });
});

describe("cleanupSurfaceDiagram", () => {
    const reported = { status: "reported", items: [] };
    const applied = { status: "applied", items: [] };

    it("inspects or applies through the surface's cleanup", () => {
        const injector = injectorWith({
            bpmnCleanup: { inspect: () => reported, apply: () => applied },
        });

        expect(cleanupSurfaceDiagram(injector)).toBe(reported);
        expect(cleanupSurfaceDiagram(injector, { apply: true })).toBe(applied);
    });

    it.each([undefined, { apply: true }])(
        "fails on a surface built without the layout module (%o)",
        (options) => {
            expect(cleanupSurfaceDiagram(injectorWith({}), options)).toEqual({
                status: "failed",
                items: [],
                message: "this surface was created without the layout module",
            });
        },
    );
});

describe("subscribeFormatted", () => {
    function busWithListeners() {
        const listeners = new Map<string, (event: unknown) => void>();
        return {
            listeners,
            on: vi.fn((event: string, listener: (event: unknown) => void) => {
                listeners.set(event, listener);
            }),
            off: vi.fn((event: string) => {
                listeners.delete(event);
            }),
        };
    }

    it("hands the listener the outcome alone, without the bus's event fields", () => {
        const eventBus = busWithListeners();
        const listener = vi.fn();
        subscribeFormatted(injectorWith({ eventBus }), listener);

        eventBus.listeners.get(LAYOUT_FORMATTED_EVENT)!({
            status: "failed",
            code: "ENGINE_FAILED",
            message: "no",
            diagnostics: [],
            type: LAYOUT_FORMATTED_EVENT,
            stopPropagation: () => undefined,
        });

        expect(listener).toHaveBeenCalledWith({
            status: "failed",
            code: "ENGINE_FAILED",
            message: "no",
            diagnostics: [],
        });
    });

    it("stops listening when disposed", () => {
        const eventBus = busWithListeners();
        const dispose = subscribeFormatted(injectorWith({ eventBus }), vi.fn());

        dispose();

        expect(eventBus.listeners.has(LAYOUT_FORMATTED_EVENT)).toBe(false);
    });
});
