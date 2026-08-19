import { describe, expect, it } from "vitest";

import camundaCompat from "bpmnlint-plugin-camunda-compat";

import { bundledDefaultResolver } from "./bundledDefaultResolver";

// bpmnlint normalises a plugin's short name to its full `bpmnlint-plugin-*` name
// before calling the resolver, so that is the package the cache must answer for.
const COMPAT = "bpmnlint-plugin-camunda-compat";
const MIRAGON = "bpmnlint-plugin-miragon";

// The two engine configs the bundled default extends (see DefaultBpmnlintConfigService).
const PINNED_CONFIGS = ["camunda-platform-7-24", "camunda-cloud-8-10"];

describe("bundledDefaultResolver", () => {
    it("resolves the pinned per-platform camunda-compat configs", () => {
        expect(bundledDefaultResolver.resolveConfig(COMPAT, "camunda-platform-7-24")).toBeTruthy();
        expect(bundledDefaultResolver.resolveConfig(COMPAT, "camunda-cloud-8-10")).toBeTruthy();
    });

    it("resolves a camunda-compat rule the C8 config references", () => {
        expect(bundledDefaultResolver.resolveRule(COMPAT, "implementation")).toBeTruthy();
    });

    it("resolves the miragon layer, which is wired in but currently empty", () => {
        const config = bundledDefaultResolver.resolveConfig(MIRAGON, "recommended") as {
            rules: Record<string, unknown>;
        };
        expect(config.rules).toEqual({});
    });

    it("bundles every camunda-compat rule the pinned configs reference (guards plugin bumps)", () => {
        const referenced = PINNED_CONFIGS.flatMap((name) =>
            Object.keys((camundaCompat.configs[name] as { rules: Record<string, unknown> }).rules),
        );

        for (const ruleName of referenced) {
            if (ruleName.startsWith("bpmnlint/")) {
                continue; // core rules come from builtinResolver, not this bundle
            }
            // A missing rule throws (StaticResolver), so a plugin bump that adds or
            // renames a referenced rule fails here until the bundle is updated.
            expect(bundledDefaultResolver.resolveRule(COMPAT, ruleName)).toBeTruthy();
        }
    });

    it("misses an unknown entry by throwing, which CompositeResolver treats as fall-through", () => {
        expect(() => bundledDefaultResolver.resolveRule(COMPAT, "does-not-exist")).toThrow();
        expect(() => bundledDefaultResolver.resolveConfig(COMPAT, "camunda-cloud-99-9")).toThrow();
    });
});
