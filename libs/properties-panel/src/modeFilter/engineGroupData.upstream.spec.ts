/// <reference types="vite/client" />

import elementTemplatesDist from "bpmn-js-element-templates/dist/index.esm.js?raw";
import { describe, expect, it } from "vitest";

/**
 * Source-text half of the engineGroupData pin (the provider-group half lives in
 * `packages/bpmn-modeler/src/engineGroupData.upstream.browser.spec.ts`, which
 * needs a bundled bpmn-js the jsdom project cannot load). The design filter
 * treats any `ElementTemplates__`-prefixed group as engine chrome; this pins
 * that prefix against the installed bpmn-js-element-templates so a rename there
 * fails loudly.
 */
describe("engineGroupData element-templates prefix pin", () => {
    it("bpmn-js-element-templates dist carries the ElementTemplates__ group prefix", () => {
        expect(elementTemplatesDist).toContain("ElementTemplates__");
    });
});
