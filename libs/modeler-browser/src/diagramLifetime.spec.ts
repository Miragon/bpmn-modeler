import { describe, expect, it, vi } from "vitest";

import { installForDiagramLifetime, type LifetimeEventBus } from "./diagramLifetime";

// diagram-js runs higher priorities first.
function createEventBus() {
    const listeners: { event: string; priority: number; listener: () => void }[] = [];
    const eventBus: LifetimeEventBus = {
        on(event, priority, listener) {
            listeners.push({ event, priority, listener });
        },
    };
    const fire = (event: string): void => {
        listeners
            .filter((entry) => entry.event === event)
            .sort((left, right) => right.priority - left.priority)
            .forEach(({ listener }) => listener());
    };
    return { eventBus, fire };
}

describe("installForDiagramLifetime", () => {
    it("installs after the default diagram.init listeners", () => {
        const { eventBus, fire } = createEventBus();
        const order: string[] = [];
        installForDiagramLifetime(eventBus, () => {
            order.push("install");
            return () => {};
        });
        eventBus.on("diagram.init", 1000, () => order.push("module"));

        fire("diagram.init");

        expect(order).toEqual(["module", "install"]);
    });

    it("installs nothing before diagram.init", () => {
        const { eventBus, fire } = createEventBus();
        const install = vi.fn(() => () => {});
        installForDiagramLifetime(eventBus, install);

        fire("diagram.destroy");

        expect(install).not.toHaveBeenCalled();
    });

    it("disposes on diagram.destroy before the canvas removes its container", () => {
        const { eventBus, fire } = createEventBus();
        const order: string[] = [];
        installForDiagramLifetime(eventBus, () => () => order.push("dispose"));
        eventBus.on("diagram.destroy", 500, () => order.push("canvas"));
        fire("diagram.init");

        fire("diagram.destroy");

        expect(order).toEqual(["dispose", "canvas"]);
    });

    it("disposes once when diagram.destroy fires twice", () => {
        const { eventBus, fire } = createEventBus();
        const dispose = vi.fn();
        installForDiagramLifetime(eventBus, () => dispose);
        fire("diagram.init");

        fire("diagram.destroy");
        fire("diagram.destroy");

        expect(dispose).toHaveBeenCalledOnce();
    });
});
