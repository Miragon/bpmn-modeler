/**
 * Import this subpath before creating a modeler and pass it as `linting.module`.
 * Linting is injected so consumers that omit it do not bundle the lint stack.
 */
import bpmnLintingModule from "bpmn-js-bpmnlint";
import "bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css";
import "./bpmnlint.css";

import { LintCallbacks, LintConfigService, LintTierInit } from "./LintConfigService";

/** Builds the per-instance lint module for the consumer's `linting.module`. */
export function createLintModule(tier: LintTierInit, callbacks: LintCallbacks): unknown {
    return {
        __depends__: [bpmnLintingModule],
        // Initialize eagerly so import.done starts linting without a getService call.
        __init__: ["bpmnLintConfig"],
        bpmnLintConfig: ["type", LintConfigService],
        lintTier: ["value", tier],
        lintCallbacks: ["value", callbacks],
    };
}

export type { LintCallbacks, LintTierInit } from "./LintConfigService";
export type { LintConfigByMode, LintConfigOption } from "./lintConfigResolution";
