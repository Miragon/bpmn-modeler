/**
 * Import this subpath before creating a modeler and pass it as `linting.module`.
 * Linting is injected so consumers that omit it do not bundle the lint stack.
 */
import { naming } from "@miragon/bpmnlint-plugin-rules";
import type { ElementIdConventionOptions } from "@miragon/bpmn-modeler-types";
import bpmnLintingModule from "bpmn-js-bpmnlint";
import "bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css";
import "./bpmnlint/adapter/in/bpmnlint.css";

import {
    LintCallbacks,
    LintConfigService,
    LintTierInit,
} from "./bpmnlint/service/LintConfigService";
import { LintIssuePopover } from "./bpmnlint/adapter/in/LintIssuePopover";
import { LintUpdateService } from "./bpmnlint/adapter/in/LintUpdateService";
import type { ElementIdConvention } from "./modeler/port/publicApi";

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

/**
 * The convention of the bpmnlint rule `@miragon/rules/element-id-naming` for
 * `setElementIdSettings({ convention })`: its Miragon defaults, or the options a
 * `.bpmnlintrc` gives the rule.
 */
export function createElementIdConvention(
    options?: ElementIdConventionOptions,
): ElementIdConvention {
    return new naming.ElementIdConvention(options);
}

export type { LintCallbacks, LintTierInit } from "./bpmnlint/service/LintConfigService";
export type { LintConfigByMode, LintConfigOption } from "./bpmnlint/domain/lintConfigResolution";
