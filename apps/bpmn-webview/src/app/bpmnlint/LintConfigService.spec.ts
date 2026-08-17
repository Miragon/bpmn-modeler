import { beforeEach, describe, expect, it, vi } from "vitest";

import { LintConfigService } from "./LintConfigService";

/** Minimal stand-in for the bpmn-js-bpmnlint `linting` DI service. */
function fakeLinting() {
    return {
        active: false,
        lint: undefined as undefined | (() => Promise<unknown>),
        isActive(): boolean {
            return this.active;
        },
        toggle: vi.fn(function (this: { active: boolean }, next?: boolean) {
            this.active = next ?? !this.active;
        }),
        update: vi.fn(),
    };
}

/**
 * Rebuilds the host shell's `.content > .canvas > .djs-container` chain so the
 * service's panel mount (re-parenting the canvas host into a column) has the
 * real DOM shape to work against.
 */
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
    };
}

function fakeElementRegistry(elements: Record<string, { businessObject?: { name?: string } }>) {
    return { get: (id: string) => elements[id] };
}

function makeService(
    linting = fakeLinting(),
    canvas = fakeCanvas(),
    elements: Record<string, { businessObject?: { name?: string } }> = {},
    selection = { select: vi.fn() },
) {
    const service = new LintConfigService(linting, canvas, fakeElementRegistry(elements), selection);
    return { service, linting, canvas, selection };
}

beforeEach(() => {
    document.body.className = "";
    document.body.innerHTML = "";
    // Overlay visibility is seeded from / persisted to the URL, so reset it
    // between tests to keep them isolated.
    window.history.replaceState(null, "", "/");
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

    it("activates linting when results arrive", () => {
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
    it("docks the panel below the canvas host inside a column wrapper", () => {
        const canvas = fakeCanvas();
        const { service } = makeService(fakeLinting(), canvas);

        service.render({});

        const column = canvas.content.querySelector(".lint-problems-column");
        expect(column).not.toBeNull();
        expect(column!.children[0]).toBe(canvas.canvasHost);
        expect(column!.children[1]?.classList.contains("lint-problems")).toBe(true);
        expect(canvas.resized).toHaveBeenCalled();
    });

    it("lists findings sorted by severity and navigates on row click", () => {
        const canvas = fakeCanvas();
        const selection = { select: vi.fn() };
        const task = { businessObject: { name: "Do work" } };
        const { service } = makeService(fakeLinting(), canvas, { Task_1: task }, selection);

        service.render({
            "label-required": [{ id: "Task_1", message: "Element is missing label", category: "warn" }],
            "no-implementation": [{ id: "Task_1", message: "Missing implementation", category: "error" }],
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
    });

    it("renders findings without an element id as non-clickable rows", () => {
        const { service, selection } = makeService();

        service.render({ "some-rule": [{ message: "Process-level problem", category: "error" }] });

        const row = document.querySelector<HTMLButtonElement>(".lint-problems__row");
        expect(row?.disabled).toBe(true);
        row?.click();
        expect(selection.select).not.toHaveBeenCalled();
    });

    it("keeps overlays hidden across re-renders after the user turned them off", () => {
        const { service, linting } = makeService();
        service.render({});
        expect(linting.isActive()).toBe(true);

        document.querySelector<HTMLButtonElement>(".lint-problems__overlays")!.click();
        expect(linting.isActive()).toBe(false);
        linting.update.mockClear();

        // Host re-lints on every document change; that must not undo the choice.
        service.render({});
        expect(linting.isActive()).toBe(false);
        expect(linting.update).not.toHaveBeenCalled();

        document.querySelector<HTMLButtonElement>(".lint-problems__overlays")!.click();
        expect(linting.isActive()).toBe(true);
    });

    it("persists the overlay choice to the URL", () => {
        const { service } = makeService();
        service.render({});

        // Turn overlays off -> URL gains ?overlays=off.
        document.querySelector<HTMLButtonElement>(".lint-problems__overlays")!.click();
        expect(new URLSearchParams(window.location.search).get("overlays")).toBe("off");

        // Turn them back on -> the param is removed again.
        document.querySelector<HTMLButtonElement>(".lint-problems__overlays")!.click();
        expect(new URLSearchParams(window.location.search).get("overlays")).toBeNull();
    });

    it("starts with overlays hidden when the URL says so", () => {
        window.history.replaceState(null, "", "/?overlays=off");
        const { service, linting } = makeService();

        service.render({});

        // Panel is shown with findings, but overlays stay off and the eye button
        // reflects the hidden state.
        expect(document.querySelector(".lint-problems--visible")).not.toBeNull();
        expect(linting.isActive()).toBe(false);
        expect(
            document
                .querySelector(".lint-problems__overlays")!
                .classList.contains("lint-problems__overlays--off"),
        ).toBe(true);
    });
});
