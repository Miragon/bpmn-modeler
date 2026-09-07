import { describe, expect, it } from "vitest";
import type { BpmnlintConfig } from "@miragon/bpmn-modeler-types";

import { isLintConfigByMode, resolveLintConfig } from "./lintConfigResolution";

/** Whether a resolved config pulls in the Camunda engine (deployability) layer. */
function hasCamundaLayer(config: BpmnlintConfig): boolean {
    return JSON.stringify(config).includes("camunda-compat");
}

describe("isLintConfigByMode", () => {
    it("is false for a single BpmnlintConfig", () => {
        expect(isLintConfigByMode({ rules: { "label-required": "warn" } })).toBe(false);
        expect(isLintConfigByMode({ extends: "bpmnlint:recommended" })).toBe(false);
        expect(isLintConfigByMode({})).toBe(false);
    });

    it("is true when a design or implement key is present", () => {
        expect(isLintConfigByMode({ design: {} })).toBe(true);
        expect(isLintConfigByMode({ implement: {} })).toBe(true);
        expect(isLintConfigByMode({ design: {}, implement: {} })).toBe(true);
    });
});

describe("resolveLintConfig", () => {
    it("applies a single config verbatim in both modes", () => {
        const config: BpmnlintConfig = { rules: { "label-required": "warn" } };
        expect(resolveLintConfig("design", "c7", config)).toBe(config);
        expect(resolveLintConfig("implement", "c7", config)).toBe(config);
    });

    it("picks the by-mode entry for the active mode", () => {
        const design: BpmnlintConfig = { extends: "bpmnlint:recommended" };
        const implement: BpmnlintConfig = { extends: "bpmnlint:all" };
        expect(resolveLintConfig("design", "c7", { design, implement })).toBe(design);
        expect(resolveLintConfig("implement", "c7", { design, implement })).toBe(implement);
    });

    it("falls back to the mode default for a missing by-mode entry", () => {
        const implement: BpmnlintConfig = { extends: "bpmnlint:all" };
        // No `design` entry → the Design default (no engine layer), not `implement`.
        const resolved = resolveLintConfig("design", "c7", { implement });
        expect(resolved).not.toBe(implement);
        expect(hasCamundaLayer(resolved)).toBe(false);
    });

    it("adds the Camunda engine layer only for the implement default", () => {
        expect(hasCamundaLayer(resolveLintConfig("implement", "c7", undefined))).toBe(true);
        expect(hasCamundaLayer(resolveLintConfig("design", "c7", undefined))).toBe(false);
    });

    it("never adds the engine layer when no engine is given", () => {
        expect(hasCamundaLayer(resolveLintConfig("implement", undefined, undefined))).toBe(false);
        expect(hasCamundaLayer(resolveLintConfig("design", undefined, undefined))).toBe(false);
    });
});
