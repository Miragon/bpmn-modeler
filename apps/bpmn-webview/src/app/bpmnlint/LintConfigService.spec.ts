import { beforeEach, describe, expect, it, vi } from "vitest";

import { LintConfigService } from "./LintConfigService";

/** The narrow host port; these render tests never reach its off/enable clicks. */
const lintingHost = { setLintingEnabled: vi.fn() };

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
 * A fake diagram-js `Canvas` over a fresh `.djs-container` in the document, so
 * the service's state classes and pill lookups are asserted per-container
 * instead of on `document.body` (the multi-instance scoping this test guards).
 */
function fakeCanvas(): { getContainer(): HTMLElement } {
    const container = document.createElement("div");
    container.className = "djs-container";
    document.body.appendChild(container);
    return { getContainer: () => container };
}

/** Appends a vendor summary pill (wrapped, as bpmn-js-bpmnlint mounts it) to a container. */
function addPill(container: HTMLElement): HTMLButtonElement {
    const pill = document.createElement("button");
    pill.className = "bjsl-button";
    const wrap = document.createElement("div");
    wrap.appendChild(pill);
    container.appendChild(wrap);
    return pill;
}

beforeEach(() => {
    document.body.innerHTML = "";
    vi.clearAllMocks();
});

describe("LintConfigService.render", () => {
    it("overrides linting.lint to return the host-provided results", async () => {
        const linting = fakeLinting();
        const svc = new LintConfigService(linting, lintingHost, (s) => s, fakeCanvas());

        const results = { "label-required": [{ id: "Task_1", message: "x", category: "warn" }] };
        svc.render(results);

        expect(linting.lint).toBeDefined();
        await expect(linting.lint!()).resolves.toEqual(results);
    });

    it("activates linting and marks the container active when results arrive", () => {
        const linting = fakeLinting();
        const canvas = fakeCanvas();

        new LintConfigService(linting, lintingHost, (s) => s, canvas).render({});

        expect(linting.isActive()).toBe(true);
        expect(canvas.getContainer().classList.contains("bpmnlint-active")).toBe(true);
        // Never leaks onto the page-global body — that is what let two modelers
        // clobber each other before scoping.
        expect(document.body.classList.contains("bpmnlint-active")).toBe(false);
    });

    it("re-renders via update() when already active", () => {
        const linting = fakeLinting();
        linting.active = true;
        const svc = new LintConfigService(linting, lintingHost, (s) => s, fakeCanvas());

        svc.render({});

        expect(linting.update).toHaveBeenCalledTimes(1);
        expect(linting.toggle).not.toHaveBeenCalled();
    });

    it("deactivates linting and clears the container class when results are null", () => {
        const linting = fakeLinting();
        linting.active = true;
        const canvas = fakeCanvas();
        canvas.getContainer().classList.add("bpmnlint-active");

        new LintConfigService(linting, lintingHost, (s) => s, canvas).render(null);

        expect(linting.toggle).toHaveBeenCalledWith(false);
        expect(canvas.getContainer().classList.contains("bpmnlint-active")).toBe(false);
    });

    it("does not toggle when already inactive and results are null", () => {
        const linting = fakeLinting();

        new LintConfigService(linting, lintingHost, (s) => s, fakeCanvas()).render(null);

        expect(linting.toggle).not.toHaveBeenCalled();
    });
});

describe("LintConfigService: per-container scoping", () => {
    it("wraps only its own container's pill and marks only its own container", () => {
        const canvasA = fakeCanvas();
        const canvasB = fakeCanvas();
        const containerA = canvasA.getContainer();
        const containerB = canvasB.getContainer();
        addPill(containerA);
        addPill(containerB);

        new LintConfigService(fakeLinting(), lintingHost, (s) => s, canvasA).render({});

        // The off-button toolbar is built around A's pill, inside A's container.
        expect(containerA.querySelector(".lint-toolbar")).not.toBeNull();
        expect(containerB.querySelector(".lint-toolbar")).toBeNull();
        expect(containerA.classList.contains("bpmnlint-active")).toBe(true);
        expect(containerB.classList.contains("bpmnlint-active")).toBe(false);
    });
});
