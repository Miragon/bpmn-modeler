import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Filesystem half of the engineGroupData pin (the provider-group half lives in
 * `packages/bpmn-modeler/src/engineGroupData.upstream.browser.spec.ts`, which
 * needs a bundled bpmn-js the jsdom project cannot load). The design filter
 * treats any `ElementTemplates__`-prefixed group as engine chrome; this pins
 * that prefix against the installed bpmn-js-element-templates so a rename there
 * fails loudly.
 */
describe("engineGroupData element-templates prefix pin", () => {
    it("bpmn-js-element-templates dist carries the ElementTemplates__ group prefix", () => {
        expect(readFileSync(locateElementTemplatesDist(), "utf8")).toContain("ElementTemplates__");
    });
});

function locateElementTemplatesDist(): string {
    const here = createRequire(import.meta.url);
    const candidates = [
        "bpmn-js-element-templates/dist/index.esm.js",
        "bpmn-js-element-templates/dist/index.js",
    ];
    // The package is a transitive dep, so it can be hoisted or nested under
    // camunda-bpmn-js / bpmn-js-properties-panel; resolve from each host in turn.
    const bases = [
        import.meta.url,
        ...["camunda-bpmn-js/package.json", "bpmn-js-properties-panel/package.json"].flatMap(
            (pkg) => {
                try {
                    return [here.resolve(pkg)];
                } catch {
                    return [];
                }
            },
        ),
    ];
    for (const base of bases) {
        const scoped = createRequire(base);
        for (const candidate of candidates) {
            try {
                return scoped.resolve(candidate);
            } catch {
                // try next candidate
            }
        }
    }
    throw new Error("could not locate bpmn-js-element-templates dist");
}
