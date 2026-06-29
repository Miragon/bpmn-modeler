import { beforeEach, describe, expect, it, vi } from "vitest";

import { LintConfigSanitizerService } from "./LintConfigSanitizerService";
import { LintConfigService } from "./LintConfigService";

/** Minimal stand-in for the bpmn-js-bpmnlint `linting` DI service. */
function fakeLinting() {
    return {
        active: false,
        isActive(): boolean {
            return this.active;
        },
        toggle: vi.fn(function (this: { active: boolean }, next?: boolean) {
            this.active = next ?? !this.active;
        }),
        setLinterConfig: vi.fn(),
    };
}

beforeEach(() => {
    document.body.className = "";
    vi.clearAllMocks();
});

describe("LintConfigService.apply", () => {
    it("activates linting and reveals the button when a config is applied", () => {
        const linting = fakeLinting();

        const warnings = new LintConfigService(linting, new LintConfigSanitizerService()).apply({
            extends: "bpmnlint:recommended",
        });

        expect(linting.setLinterConfig).toHaveBeenCalledTimes(1);
        const { config, resolver } = linting.setLinterConfig.mock.calls[0][0];
        expect(config.extends).toEqual(["bpmnlint:recommended"]);
        expect(resolver).toBeDefined();
        expect(linting.isActive()).toBe(true);
        expect(document.body.classList.contains("bpmnlint-active")).toBe(true);
        expect(warnings).toEqual([]);
    });

    it("returns warnings for unsupported entries while still applying built-ins", () => {
        const linting = fakeLinting();

        const warnings = new LintConfigService(linting, new LintConfigSanitizerService()).apply({
            rules: { "my-plugin/foo": "error" },
        });

        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("my-plugin/foo");
        expect(linting.setLinterConfig).toHaveBeenCalledTimes(1);
        expect(document.body.classList.contains("bpmnlint-active")).toBe(true);
    });

    it("deactivates linting and hides the button when the config is null", () => {
        const linting = fakeLinting();
        linting.active = true;
        document.body.classList.add("bpmnlint-active");

        const warnings = new LintConfigService(linting, new LintConfigSanitizerService()).apply(
            null,
        );

        expect(linting.toggle).toHaveBeenCalledWith(false);
        expect(linting.setLinterConfig).not.toHaveBeenCalled();
        expect(document.body.classList.contains("bpmnlint-active")).toBe(false);
        expect(warnings).toEqual([]);
    });

    it("does not toggle when already inactive and the config is null", () => {
        const linting = fakeLinting();

        new LintConfigService(linting, new LintConfigSanitizerService()).apply(null);

        expect(linting.toggle).not.toHaveBeenCalled();
    });
});
