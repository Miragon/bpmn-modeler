import EventBus from "diagram-js/lib/core/EventBus";
import { Injector } from "didi";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FitViewportButtonModule } from "./fitViewportButtonModule";

function fakeDiagram() {
    const canvasContainer = document.createElement("div");
    document.body.append(canvasContainer);
    const eventBus = new EventBus();
    const canvas = {
        getContainer: () => canvasContainer,
        focus: vi.fn(),
        isFocused: vi.fn(() => false),
        viewbox: vi.fn(() => ({
            inner: { width: 0, height: 0 },
            outer: { width: 800, height: 600 },
        })),
        zoom: vi.fn(),
    };
    new Injector([
        {
            eventBus: ["value", eventBus],
            canvas: ["value", canvas],
            translate: ["value", (template: string) => `translated ${template}`],
        },
        FitViewportButtonModule,
    ]).init();
    const button = () => canvasContainer.querySelector<HTMLButtonElement>(".fit-viewport-button");
    return { eventBus, canvas, button };
}

afterEach(() => document.body.replaceChildren());

describe("FitViewportButtonModule", () => {
    it("adds the translated button to the canvas on diagram.init and removes it on diagram.destroy", () => {
        const { eventBus, button } = fakeDiagram();
        expect(button()).toBeNull();

        eventBus.fire("diagram.init");
        expect(button()?.getAttribute("aria-label")).toBe("translated Fit diagram to view");

        eventBus.fire("diagram.destroy");
        expect(button()).toBeNull();
    });

    it("marks the button while the canvas holds the keyboard", () => {
        const { eventBus, button } = fakeDiagram();
        eventBus.fire("diagram.init");

        eventBus.fire("canvas.focus.changed", { focused: true });
        expect(button()?.hasAttribute("data-canvas-focused")).toBe(true);

        eventBus.fire("canvas.focus.changed", { focused: false });
        expect(button()?.hasAttribute("data-canvas-focused")).toBe(false);
    });

    it("fits the canvas when pressed", () => {
        const { eventBus, canvas, button } = fakeDiagram();
        eventBus.fire("diagram.init");

        button()!.click();

        expect(canvas.zoom).toHaveBeenCalledExactlyOnceWith("fit-viewport");
    });

    it("adds nothing when an earlier diagram.init listener throws", () => {
        const { eventBus, button } = fakeDiagram();
        eventBus.on("diagram.init", () => {
            throw new Error("late poison");
        });

        expect(() => eventBus.fire("diagram.init")).toThrow("late poison");

        expect(button()).toBeNull();
    });
});
