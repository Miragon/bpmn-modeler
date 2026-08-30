import { describe, expect, it } from "vitest";

import { RecordingBrowserResolver, staticUnresolvedModdleExtensions } from "./browserResolver";

describe("RecordingBrowserResolver", () => {
    it("resolves a bundled Miragon rule without recording it as unresolved", () => {
        const resolver = new RecordingBrowserResolver();

        const rule = resolver.resolveRule("@miragon/bpmnlint-plugin-rules", "no-generated-ids");

        expect(rule).toBeDefined();
        expect(resolver.unresolved).toEqual([]);
    });

    it("records an unknown rule and returns a reporting no-op", () => {
        const resolver = new RecordingBrowserResolver();

        const rule = resolver.resolveRule("bpmnlint-plugin-ghost", "does-not-exist");

        // The no-op is a rule *factory*; invoking it yields an empty check visitor,
        // so bpmnlint's testRule guard is satisfied and the run does not fail.
        const built = (rule as () => { check: unknown })();
        expect(built.check).toBeTypeOf("function");
        expect(resolver.unresolved).toEqual(["bpmnlint-plugin-ghost/does-not-exist"]);
    });

    it("records an unknown config under its plugin: key and returns an empty config", () => {
        const resolver = new RecordingBrowserResolver();

        const config = resolver.resolveConfig("bpmnlint-plugin-ghost", "recommended");

        expect(config).toEqual({ rules: {} });
        expect(resolver.unresolved).toEqual(["plugin:bpmnlint-plugin-ghost/recommended"]);
    });

    it("reset() clears the recorded misses between runs", () => {
        const resolver = new RecordingBrowserResolver();
        resolver.resolveRule("bpmnlint-plugin-ghost", "x");
        expect(resolver.unresolved).toHaveLength(1);

        resolver.reset();

        expect(resolver.unresolved).toEqual([]);
    });
});

describe("staticUnresolvedModdleExtensions", () => {
    it("returns nothing when no moddleExtensions are declared", () => {
        expect(staticUnresolvedModdleExtensions({})).toEqual([]);
    });

    it("reports string-valued extensions (a browser cannot require a module path)", () => {
        expect(
            staticUnresolvedModdleExtensions({
                moddleExtensions: { custom: "custom-moddle" },
            }),
        ).toEqual(["moddleExtension:custom"]);
    });

    it("honours object extensions on prefixes the live tree already registers", () => {
        expect(
            staticUnresolvedModdleExtensions({
                moddleExtensions: { camunda: { name: "Camunda" }, zeebe: { name: "Zeebe" } },
            }),
        ).toEqual([]);
    });

    it("reports object extensions on prefixes the live tree does not register", () => {
        expect(
            staticUnresolvedModdleExtensions({
                moddleExtensions: { acme: { name: "Acme" } },
            }),
        ).toEqual(["moddleExtension:acme"]);
    });
});
