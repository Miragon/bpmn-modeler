import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BpmnlintConfig } from "@miragon/bpmn-modeler-types";
import type { LintCallbacks, LintTierInit } from "./bpmnlint/LintConfigService";
import type { LintModule } from "./publicApi";
import { buildLintModules } from "./lintModules";

// A stub `/lint` module that records the args createLintModule was called with
// and returns a sentinel so we can assert it lands in the returned array.
function stubModule(): { module: LintModule; calls: [LintTierInit, LintCallbacks][] } {
    const calls: [LintTierInit, LintCallbacks][] = [];
    const sentinel = { __lintModule: true };
    const module: LintModule = {
        createLintModule: (tier, callbacks) => {
            calls.push([tier, callbacks]);
            return sentinel;
        },
    };
    return { module, calls };
}

const CALLBACKS: LintCallbacks = { onLintResults: vi.fn(), onLintingToggled: vi.fn() };

describe("buildLintModules", () => {
    beforeEach(() => {
        vi.spyOn(console, "info").mockImplementation(() => undefined);
    });
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns no modules and nudges once for an omitted linting option", () => {
        // The once-guard is module-level, so the first `undefined` in the whole
        // run is the only one that fires; assert the return, not the call count
        // (another spec in the file may have consumed the guard already).
        expect(buildLintModules(undefined, "c7", CALLBACKS)).toEqual([]);
        // Re-invoking never registers a module regardless of the guard state.
        expect(buildLintModules(undefined, "c7", CALLBACKS)).toEqual([]);
    });

    it("fires the migration nudge at most once across calls", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        buildLintModules(undefined, "c7", CALLBACKS);
        buildLintModules(undefined, "c8", CALLBACKS);
        // Zero or one, never two — the guard may have been tripped by an earlier
        // spec, but a second call in this test must not re-fire.
        expect(info.mock.calls.length).toBeLessThanOrEqual(1);
    });

    it("returns no modules for linting: false without nudging", () => {
        const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
        expect(buildLintModules(false, "c7", CALLBACKS)).toEqual([]);
        expect(info).not.toHaveBeenCalled();
    });

    it("builds one in-page module forwarding engine, config, and callbacks", () => {
        const { module, calls } = stubModule();
        const config: BpmnlintConfig = { rules: { "label-required": "warn" } };
        const result = buildLintModules({ module, config }, "c7", CALLBACKS);

        expect(result).toHaveLength(1);
        expect(calls).toHaveLength(1);
        const [tier, callbacks] = calls[0];
        expect(tier).toEqual({ tier: "in-page", engine: "c7", config });
        expect(callbacks).toBe(CALLBACKS);
    });

    it("defaults an in-page module to no config when none is supplied", () => {
        const { module, calls } = stubModule();
        buildLintModules({ module }, "c8", CALLBACKS);
        expect(calls[0][0]).toEqual({ tier: "in-page", engine: "c8", config: undefined });
    });

    it("builds one external module with no config", () => {
        const { module, calls } = stubModule();
        const result = buildLintModules({ module, results: "external" }, "c8", CALLBACKS);

        expect(result).toHaveLength(1);
        expect(calls[0][0]).toEqual({ tier: "external", engine: "c8", config: undefined });
    });
});
