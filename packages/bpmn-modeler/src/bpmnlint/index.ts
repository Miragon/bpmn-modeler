/**
 * Public `@miragon/bpmn-modeler/lint` subpath entry.
 *
 * This module — and only this module — statically imports the lint stack
 * (`bpmn-js-bpmnlint`, `bpmnlint`'s `Linter`, `@miragon/bpmnlint-plugin-rules`,
 * and the CSS). The package never imports it: a host that wants linting imports
 * this subpath itself and hands the namespace in as `linting.module` (see
 * {@link LintModule}). That injection is what keeps the whole stack out of a
 * `linting: false` consumer's module graph — even under single-file bundlers,
 * where a reachable internal dynamic import can no longer be tree-shaken.
 *
 * bpmn-js modules are fixed at construction, so the host resolves this import
 * *before* `createModeler`; the facade then calls {@link createLintModule} with
 * the per-instance tier + config + callbacks and drops the returned module into
 * `additionalModules`.
 */
import bpmnLintingModule from "bpmn-js-bpmnlint";
import "bpmn-js-bpmnlint/dist/assets/css/bpmn-js-bpmnlint.css";
import "./bpmnlint.css";

import { LintCallbacks, LintConfigService, LintTierInit } from "./LintConfigService";

/**
 * Builds the bpmn-js DI module for one modeler instance: the vendor overlay
 * module plus {@link LintConfigService} and the two per-instance value providers
 * it injects (`lintTier`, `lintCallbacks`). `bpmnLintConfig` is eagerly
 * initialised (`__init__`) so the in-page tier can subscribe to `import.done`
 * and start linting without the host ever calling `getService`.
 */
export function createLintModule(tier: LintTierInit, callbacks: LintCallbacks): unknown {
    return {
        __depends__: [bpmnLintingModule],
        __init__: ["bpmnLintConfig"],
        bpmnLintConfig: ["type", LintConfigService],
        lintTier: ["value", tier],
        lintCallbacks: ["value", callbacks],
    };
}

export type { LintCallbacks, LintTierInit } from "./LintConfigService";
