import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ElementIdReview } from "./ElementIdReview";
import type { ElementIdProposal, ElementIdsService } from "./ElementIdsService";

const task = { id: "Activity_1", type: "bpmn:Task" };
const proposal: ElementIdProposal = {
    candidate: {
        id: "Activity_1",
        name: "Check",
        type: "bpmn:Task",
        element: { $type: "bpmn:Task", id: "Activity_1", name: "Check" },
        kind: "activity",
        target: { kind: "element", element: task },
        shown: task,
    },
    status: "rename",
    newId: "task_check",
    clash: false,
};

let page: HTMLElement;

function setUp(options: { directEditing?: boolean; initiallyUnchecked?: string[] } = {}) {
    const themed = document.createElement("div");
    themed.setAttribute("data-bpmn-theme", "dark");
    const bjs = document.createElement("div");
    const djs = document.createElement("div");
    bjs.appendChild(djs);
    themed.appendChild(bjs);
    page.appendChild(themed);

    const listeners = new Map<string, (() => void)[]>();
    const eventBus = {
        on: (events: string | string[], listener: () => void) => {
            for (const event of [events].flat()) {
                listeners.set(event, [...(listeners.get(event) ?? []), listener]);
            }
        },
    };
    const fire = (event: string) =>
        act(() => listeners.get(event)?.forEach((listener) => listener()));

    const canvas = { getContainer: () => djs, scrollToElement: vi.fn(), focus: vi.fn() };
    const selection = { select: vi.fn() };
    const services: Record<string, unknown> = {
        selection,
        directEditing: { isActive: () => options.directEditing ?? false },
    };
    const injector = { get: <T>(name: string) => (services[name] ?? null) as T | null };
    const elementIds = {
        getSettings: () => ({ followName: false }),
        propose: vi.fn(() => [proposal]),
        rename: vi.fn(() => 1),
        initiallyUnchecked: vi.fn(() => new Set(options.initiallyUnchecked ?? [])),
    };
    const review = new ElementIdReview(
        elementIds as unknown as ElementIdsService,
        canvas,
        eventBus,
        injector,
    );
    return { review, bjs, canvas, selection, elementIds, fire };
}

const flushMicrotasks = () => new Promise<void>((resolve) => queueMicrotask(resolve));

beforeEach(() => {
    page = document.createElement("div");
    document.body.appendChild(page);
});

afterEach(() => {
    page.remove();
});

describe("ElementIdReview", () => {
    it("opens the panel beside the canvas, in the instance's theme, and only once", () => {
        const { review, bjs } = setUp();

        act(() => review.open());
        act(() => review.open());

        const roots = bjs.querySelectorAll(".eid-root");
        expect(roots).toHaveLength(1);
        expect(roots[0]?.getAttribute("data-bpmn-theme")).toBe("dark");
        expect(roots[0]?.querySelector(".eid-panel")).not.toBeNull();
        expect(review.isOpen()).toBe(true);
    });

    it("proposes again after every diagram change while open, and not while closed", () => {
        const { review, elementIds, fire } = setUp();

        fire("commandStack.changed");
        expect(elementIds.propose).not.toHaveBeenCalled();

        act(() => review.open());
        fire("commandStack.changed");

        expect(elementIds.propose).toHaveBeenCalledTimes(2);
    });

    it("starts with the rows the service leaves unchecked, asked once on opening", () => {
        const { review, elementIds, fire } = setUp({ initiallyUnchecked: ["Activity_1"] });
        act(() => review.open());
        fire("commandStack.changed");

        expect(elementIds.propose).toHaveBeenLastCalledWith(new Set(["Activity_1"]));
        expect(elementIds.initiallyUnchecked).toHaveBeenCalledTimes(1);
    });

    it.each(["import.done", "diagram.clear", "diagram.destroy"])("closes on %s", (event) => {
        const { review, bjs, fire } = setUp();
        act(() => review.open());

        fire(event);

        expect(review.isOpen()).toBe(false);
        expect(bjs.querySelector(".eid-root")).toBeNull();
    });

    it("renames on Apply, closes and gives the canvas the focus back", async () => {
        const { review, bjs, canvas, elementIds } = setUp();
        act(() => review.open());

        act(() => bjs.querySelector<HTMLButtonElement>(".eid-primary")!.click());
        await flushMicrotasks();

        expect(elementIds.rename).toHaveBeenCalledWith(new Set());
        expect(review.isOpen()).toBe(false);
        expect(canvas.focus).toHaveBeenCalled();
    });

    it("leaves the focus with a label being edited when the panel closes", async () => {
        const { review, canvas } = setUp({ directEditing: true });
        act(() => review.open());

        act(() => review.close());
        await flushMicrotasks();

        expect(canvas.focus).not.toHaveBeenCalled();
    });

    it("selects and scrolls to the element of a clicked row", () => {
        const { review, bjs, canvas, selection } = setUp();
        act(() => review.open());

        act(() => bjs.querySelector<HTMLButtonElement>(".eid-row-main")!.click());

        expect(selection.select).toHaveBeenCalledWith(task);
        expect(canvas.scrollToElement).toHaveBeenCalledWith(task);
    });
});
