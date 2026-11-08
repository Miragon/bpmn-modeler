import { describe, expect, it, vi } from "vitest";

import { CompositeResolver, RequestAttribution, Resolver } from "./CompositeResolver";

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

    describe("attributing blocked packages", () => {
        /** A workspace delegate that blocks the listed packages and resolves nothing. */
        function blockingWorkspace(blockedByPkg: Record<string, string>) {
            let blockedSinceBegin: string[] = [];
            const attribution: RequestAttribution = {
                beginRequest: vi.fn(() => {
                    blockedSinceBegin = [];
                }),
                blockedSinceBegin: () => blockedSinceBegin,
            };
            const block = (pkg: string) => {
                if (pkg in blockedByPkg) {
                    blockedSinceBegin.push(blockedByPkg[pkg]);
                }
                throw new Error("not allowed");
            };
            const workspace: Resolver = { resolveRule: block, resolveConfig: block };
            return { workspace, attribution };
        }

        it("calls a blocked package needed when its request ends unresolved", () => {
            const { workspace, attribution } = blockingWorkspace({ acme: "/acme" });
            const resolver = new CompositeResolver([workspace], new Map(), attribution);

            resolver.resolveRule("acme", "only-here");
            resolver.resolveConfig("acme", "only-here");

            expect([...resolver.neededBlocked]).toEqual(["/acme"]);
        });

        it("leaves a blocked package unneeded when a later delegate serves its request", () => {
            const rule = () => ({ check: () => undefined });
            const { workspace, attribution } = blockingWorkspace({ acme: "/acme" });
            const bundled = resolverOf({ "acme/served": rule }, { "acme/served": { rules: {} } });
            const resolver = new CompositeResolver([workspace, bundled], new Map(), attribution);

            resolver.resolveRule("acme", "served");
            resolver.resolveConfig("acme", "served");

            expect([...resolver.neededBlocked]).toEqual([]);
        });

        it("attributes each request only the packages blocked during it", () => {
            const rule = () => ({ check: () => undefined });
            const { workspace, attribution } = blockingWorkspace({
                served: "/served",
                missing: "/missing",
            });
            const bundled = resolverOf({ "served/x": rule });
            const resolver = new CompositeResolver([workspace, bundled], new Map(), attribution);

            resolver.resolveRule("served", "x");
            resolver.resolveRule("missing", "x");

            expect([...resolver.neededBlocked]).toEqual(["/missing"]);
        });

        it("begins no request for a resolution a previous run shared", () => {
            const rule = () => ({ check: () => undefined });
            const { workspace, attribution } = blockingWorkspace({});
            const resolved = new Map<string, unknown>([["rule:acme\0served", rule]]);
            const resolver = new CompositeResolver([workspace], resolved, attribution);

            expect(resolver.resolveRule("acme", "served")).toBe(rule);
            expect(attribution.beginRequest).not.toHaveBeenCalled();
        });
    });
});
