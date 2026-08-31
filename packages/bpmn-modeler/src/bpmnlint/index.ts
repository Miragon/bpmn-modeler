/**
 * Lazy-loaded chunk entry for in-canvas bpmnlint (#1373, AC 6).
 *
 * This module — and only this module — statically imports the lint stack
 * (`bpmn-js-bpmnlint`, `bpmnlint`'s `Linter`, `@miragon/bpmnlint-plugin-rules`,
 * and the CSS). Because {@link BpmnModeler.create} reaches it through a dynamic
 * `import("./bpmnlint")`, the whole stack lands in a separate chunk that is
 * fetched only when an instance actually lints (`linting !== false`), keeping it
 * out of the main webview bundle.
 *
 * bpmn-js modules are fixed at construction, so the chunk must resolve *before*
 * `new BpmnModeler7/8`. The facade awaits this import, then calls
 * {@link createLintModule} with the per-instance tier + config + callbacks and
 * drops the returned module into `additionalModules`.
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
