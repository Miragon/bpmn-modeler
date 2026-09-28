/**
 * Import this subpath before creating a modeler and pass it as `linting.module`.
 * Linting is injected so consumers that omit it do not bundle the lint stack.
 */
import bpmnLintingModule from "bpmn-js-bpmnlint";
import "bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css";
import "./bpmnlint.css";

import { LintCallbacks, LintConfigService, LintTierInit } from "./LintConfigService";
import { LintIssuePopover } from "./LintIssuePopover";
import { LintUpdateService } from "./LintUpdateService";

/** Builds the per-instance lint module for the consumer's `linting.module`. */
export function createLintModule(tier: LintTierInit, callbacks: LintCallbacks): unknown {
    return {
        __depends__: [bpmnLintingModule],
        // Initialize eagerly so import.done starts linting without a getService call.
        // lintUpdate first: bpmnLintConfig may already request a relint while constructing.
        __init__: ["lintUpdate", "bpmnLintConfig", "lintIssuePopover"],
        lintUpdate: ["type", LintUpdateService],
        bpmnLintConfig: ["type", LintConfigService],
        lintIssuePopover: ["type", LintIssuePopover],
        lintTier: ["value", tier],
        lintCallbacks: ["value", callbacks],
    };
}

export type { LintCallbacks, LintTierInit } from "./LintConfigService";
export type { LintConfigByMode, LintConfigOption } from "./lintConfigResolution";
