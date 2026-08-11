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

beforeEach(() => {
    document.body.className = "";
    vi.clearAllMocks();
});

describe("LintConfigService.render", () => {
    it("overrides linting.lint to return the host-provided results", async () => {
        const linting = fakeLinting();
        const svc = new LintConfigService(linting);

        const results = { "label-required": [{ id: "Task_1", message: "x", category: "warn" }] };
        svc.render(results);

        expect(linting.lint).toBeDefined();
        await expect(linting.lint!()).resolves.toEqual(results);
    });

    it("activates linting and reveals the button when results arrive", () => {
        const linting = fakeLinting();

        new LintConfigService(linting).render({});

        expect(linting.isActive()).toBe(true);
        expect(document.body.classList.contains("bpmnlint-active")).toBe(true);
    });

    it("re-renders via update() when already active", () => {
        const linting = fakeLinting();
        linting.active = true;
        const svc = new LintConfigService(linting);

        svc.render({});

        expect(linting.update).toHaveBeenCalledTimes(1);
        expect(linting.toggle).not.toHaveBeenCalled();
    });

    it("deactivates linting and hides the button when results are null", () => {
        const linting = fakeLinting();
        linting.active = true;
        document.body.classList.add("bpmnlint-active");

        new LintConfigService(linting).render(null);

        expect(linting.toggle).toHaveBeenCalledWith(false);
        expect(document.body.classList.contains("bpmnlint-active")).toBe(false);
    });

    it("does not toggle when already inactive and results are null", () => {
        const linting = fakeLinting();

        new LintConfigService(linting).render(null);

        expect(linting.toggle).not.toHaveBeenCalled();
    });
});
