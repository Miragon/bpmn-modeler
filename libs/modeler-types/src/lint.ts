/**
 * A single bpmnlint finding as bpmnlint's own `Linter` emits it: the offending
 * element `id`, a human-readable `message`, and a `category` (`error` / `warn` /
 * `info`). `rule`/`meta` ride along when present so the webview overlay can link
 * to a rule's documentation. Kept structurally identical to bpmnlint's report so
 * `bpmn-js-bpmnlint`'s `linting` module can render it without translation.
 */
export interface LintReport {
    readonly id?: string;
    readonly message: string;
    readonly category: string;
    readonly path?: string[];
    readonly rule?: string;
    readonly meta?: { documentation?: { url?: string } };
}

/**
 * bpmnlint's lint result: findings keyed by rule name, exactly the shape
 * `bpmn-js-bpmnlint`'s `Linting._formatIssues` consumes.
 */
export type LintResults = Record<string, LintReport[]>;

/**
 * A single rule's severity in a {@link BpmnlintConfig}: bpmnlint accepts both
 * the string form (`"error"` / `"warn"` / `"off"`) and the legacy numeric form
 * (`2` / `1` / `0`), optionally paired with a rule-specific config object.
 */
export type BpmnlintRuleSeverity = "off" | "warn" | "error" | 0 | 1 | 2;
export type BpmnlintRuleConfig = BpmnlintRuleSeverity | readonly [BpmnlintRuleSeverity, unknown];

/**
 * Structural mirror of a bpmnlint configuration (`.bpmnlintrc`) as the public
 * `linting: { config }` option accepts it (#1373). Kept structural — not an
 * import of bpmnlint's own types — so the published API surface does not leak a
 * transitive bpmnlint dependency. Unresolvable `extends`/`rules` degrade
 * gracefully at load and surface via {@link LintRunEvent.unresolved}.
 */
export interface BpmnlintConfig {
    readonly extends?: string | readonly string[];
    readonly rules?: Readonly<Record<string, BpmnlintRuleConfig>>;
}

/**
 * Outbound notification payload for one lint pass (#1373's `onLintResults`):
 * the findings the overlay renders plus the rule names that could not be
 * resolved from the supplied {@link BpmnlintConfig}. `unresolved` is how the
 * modeler reports graceful degradation instead of failing the whole run when a
 * `{ config }` references a rule the bundled resolver does not carry.
 */
export interface LintRunEvent {
    readonly results: LintResults;
    readonly unresolved: readonly string[];
}
