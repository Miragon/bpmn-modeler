import { describe, expect, it, vi } from "vitest";

import { CompositeResolver, Resolver } from "./CompositeResolver";

function missingResolver(): Resolver {
    return {
        resolveRule: vi.fn(() => {
            throw new Error("cannot resolve");
        }),
        resolveConfig: vi.fn(() => undefined),
    };
}

function resolverOf(rules: Record<string, unknown>, configs: Record<string, unknown> = {}) {
    return {
        resolveRule: vi.fn((pkg: string, name: string) => rules[`${pkg}/${name}`]),
        resolveConfig: vi.fn((pkg: string, name: string) => configs[`${pkg}/${name}`]),
    };
}

describe("CompositeResolver", () => {
    it("returns the first delegate's resolution and records misses per run", () => {
        const rule = () => ({ check: () => undefined });
        const workspace = missingResolver();
        const bundled = resolverOf({ "bpmnlint/label-required": rule });
        const resolver = new CompositeResolver([workspace, bundled]);

        expect(resolver.resolveRule("bpmnlint", "label-required")).toBe(rule);
        expect(resolver.resolveConfig("bpmnlint-plugin-x", "recommended")).toEqual({ rules: {} });
        expect(resolver.unresolved).toEqual(["plugin:bpmnlint-plugin-x/recommended"]);
    });

    it("skips every delegate for a resolution a previous run shared", () => {
        const rule = () => ({ check: () => undefined });
        const config = { rules: {} };
        const workspace = missingResolver();
        const bundled = resolverOf({ "bpmnlint/label-required": rule }, { "bpmnlint/all": config });
        const resolved = new Map<string, unknown>();
        const firstRun = new CompositeResolver([workspace, bundled], resolved);
        firstRun.resolveRule("bpmnlint", "label-required");
        firstRun.resolveConfig("bpmnlint", "all");
        vi.clearAllMocks();

        const secondRun = new CompositeResolver([workspace, bundled], resolved);

        expect(secondRun.resolveRule("bpmnlint", "label-required")).toBe(rule);
        expect(secondRun.resolveConfig("bpmnlint", "all")).toBe(config);
        expect(workspace.resolveRule).not.toHaveBeenCalled();
        expect(bundled.resolveRule).not.toHaveBeenCalled();
        expect(bundled.resolveConfig).not.toHaveBeenCalled();
    });

    it("retries a miss on the next run", () => {
        const rules: Record<string, unknown> = {};
        const workspace = resolverOf(rules);
        const resolved = new Map<string, unknown>();

        const firstRun = new CompositeResolver([workspace], resolved);
        firstRun.resolveRule("bpmnlint-plugin-custom", "late");
        expect(firstRun.unresolved).toEqual(["bpmnlint-plugin-custom/late"]);

        const lateRule = () => ({ check: () => undefined });
        rules["bpmnlint-plugin-custom/late"] = lateRule;
        const secondRun = new CompositeResolver([workspace], resolved);

        expect(secondRun.resolveRule("bpmnlint-plugin-custom", "late")).toBe(lateRule);
        expect(secondRun.unresolved).toEqual([]);
    });
});
