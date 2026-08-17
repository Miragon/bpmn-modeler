import { beforeEach, describe, expect, it, vi } from "vitest";

import { LintConfigService } from "./LintConfigService";

/** Minimal stand-in for the bpmn-js-bpmnlint `linting` DI service. */
function fakeLinting() {
    return {
        active: false,
        lint: vi.fn(() => Promise.resolve({})),
        isActive(): boolean {
            return this.active;
        },
        toggle: vi.fn(function (this: { active: boolean }, next?: boolean) {
            this.active = next ?? !this.active;
        }),
        update: vi.fn(),
    };
}

function fakeCanvas() {
    const content = document.createElement("div");
    content.className = "content";
    const canvasHost = document.createElement("div");
    canvasHost.className = "canvas";
    const container = document.createElement("div");
    container.className = "djs-container";
    canvasHost.append(container);
    content.append(canvasHost);
    document.body.append(content);
    return {
        content,
        canvasHost,
        getContainer: () => container,
        resized: vi.fn(),
        scrollToElement: vi.fn(),
        viewbox: vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 }),
    };
}

interface FakeElement {
    businessObject?: { name?: string };
    parent?: object;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    waypoints?: ReadonlyArray<{ x: number; y: number }>;
}

function fakeElementRegistry(elements: Record<string, FakeElement>) {
    return { get: (id: string) => elements[id] };
}

function makeService(
    linting = fakeLinting(),
    canvas = fakeCanvas(),
    elements: Record<string, FakeElement> = {},
    selection = { select: vi.fn() },
) {
    const service = new LintConfigService(
        linting,
        canvas,
        fakeElementRegistry(elements),
        selection,
    );
    return { service, linting, canvas, selection };
}

beforeEach(() => {
    document.body.className = "";
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

describe("LintConfigService.render", () => {
    it("overrides linting.lint to return the host-provided results", async () => {
        const linting = fakeLinting();
        const { service } = makeService(linting);

        const results = { "label-required": [{ id: "Task_1", message: "x", category: "warn" }] };
        service.render(results);

        expect(linting.lint).toBeDefined();
        await expect(linting.lint!()).resolves.toEqual(results);
    });

    it("activates marker overlays when results arrive", () => {
        const { service, linting } = makeService();

        service.render({});

        expect(linting.isActive()).toBe(true);
        expect(document.body.classList.contains("bpmnlint-active")).toBe(true);
    });

    it("re-renders via update() when already active", () => {
        const linting = fakeLinting();
        linting.active = true;
        const { service } = makeService(linting);

        service.render({});

        expect(linting.update).toHaveBeenCalledTimes(1);
        expect(linting.toggle).not.toHaveBeenCalled();
    });

    it("deactivates linting and hides the panel when results are null", () => {
        const linting = fakeLinting();
        linting.active = true;
        document.body.classList.add("bpmnlint-active");
        const { service } = makeService(linting);
        service.render({});

        service.render(null);

        expect(linting.toggle).toHaveBeenCalledWith(false);
        expect(document.body.classList.contains("bpmnlint-active")).toBe(false);
        expect(document.querySelector(".lint-problems--visible")).toBeNull();
    });

    it("does not toggle when already inactive and results are null", () => {
        const { service, linting } = makeService();

        service.render(null);

        expect(linting.toggle).not.toHaveBeenCalled();
    });
});

describe("LintConfigService problems panel", () => {
    it("docks the panel below the canvas while leaving the properties panel beside it", () => {
        const canvas = fakeCanvas();
        const { service } = makeService(fakeLinting(), canvas);

        service.render({});

        const column = canvas.content.querySelector(".lint-problems-column");
        expect(column).not.toBeNull();
        expect(column!.children[0]).toBe(canvas.canvasHost);
        expect(column!.children[1]?.classList.contains("lint-problems")).toBe(true);
        expect(canvas.resized).toHaveBeenCalled();
    });

    it("orders problems by severity and navigates to the selected element", () => {
        const canvas = fakeCanvas();
        const selection = { select: vi.fn() };
        const task = {
            businessObject: { name: "Do work" },
            parent: {},
            x: 100,
            y: 120,
            width: 100,
            height: 80,
        };
        const { service } = makeService(fakeLinting(), canvas, { Task_1: task }, selection);

        service.render({
            "label-required": [
                { id: "Task_1", message: "Element is missing label", category: "warn" },
            ],
            "no-implementation": [
                { id: "Task_1", message: "Missing implementation", category: "error" },
            ],
        });

        const rows = [...document.querySelectorAll<HTMLButtonElement>(".lint-problems__row")];
        expect(rows.map((row) => row.title)).toEqual([
            "Missing implementation",
            "Element is missing label",
        ]);
        expect(rows[0].querySelector(".lint-problems__row-element")?.textContent).toBe("Do work");

        rows[0].click();
        expect(selection.select).toHaveBeenCalledWith(task);
        expect(canvas.scrollToElement).toHaveBeenCalledWith(task);
        expect(canvas.viewbox).toHaveBeenLastCalledWith({
            x: -250,
            y: -140,
            width: 800,
            height: 600,
        });
        expect(canvas.scrollToElement.mock.invocationCallOrder[0]).toBeLessThan(
            selection.select.mock.invocationCallOrder[0],
        );
    });

    it("renders process-level problems without making them navigable", () => {
        const process = {
            businessObject: { name: "Order process" },
            x: 0,
            y: 0,
            width: 1000,
            height: 800,
        };
        const { service, selection } = makeService(fakeLinting(), fakeCanvas(), {
            Process_1: process,
        });

        service.render({
            "some-rule": [{ id: "Process_1", message: "Process-level problem", category: "error" }],
        });

        const row = document.querySelector<HTMLElement>(".lint-problems__row");
        expect(row?.tagName).toBe("DIV");
        expect(row?.querySelector("button")).toBeNull();
        row?.click();
        expect(selection.select).not.toHaveBeenCalled();
    });

    it("centers and selects sequence-flow problems from their waypoints", () => {
        const canvas = fakeCanvas();
        const selection = { select: vi.fn() };
        const flow = {
            businessObject: { name: "Rejected" },
            parent: {},
            waypoints: [
                { x: 20, y: 40 },
                { x: 120, y: 80 },
            ],
        };
        const { service } = makeService(fakeLinting(), canvas, { Flow_1: flow }, selection);

        service.render({
            "conditional-flows": [
                { id: "Flow_1", message: "Condition is missing", category: "error" },
            ],
        });
        document.querySelector<HTMLButtonElement>(".lint-problems__row")!.click();

        expect(canvas.viewbox).toHaveBeenLastCalledWith({
            x: -330,
            y: -240,
            width: 800,
            height: 600,
        });
        expect(selection.select).toHaveBeenCalledWith(flow);
    });

    it("keeps markers hidden across live result updates", () => {
        const { service, linting } = makeService();
        service.render({});
        expect(linting.isActive()).toBe(true);

        document.querySelector<HTMLButtonElement>(".lint-problems__overlays")!.click();
        expect(linting.isActive()).toBe(false);
        linting.update.mockClear();

        service.render({});

        expect(linting.isActive()).toBe(false);
        expect(linting.update).not.toHaveBeenCalled();
        expect(document.querySelector(".lint-problems--visible")).not.toBeNull();
    });
});
