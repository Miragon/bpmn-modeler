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
 * `linting: { config }` option accepts it. Kept structural — not an
 * import of bpmnlint's own types — so the published API surface does not leak a
 * transitive bpmnlint dependency. Unresolvable `extends`/`rules` degrade
 * gracefully at load and surface via {@link LintRunEvent.unresolved}.
 * Serializable across the webview↔host protocol when `moddleExtensions` is
 * omitted or carries only object-valued entries decoded from JSON — a
 * string-valued entry is a Node-only module path, so it never crosses the wire:
 * it makes {@link staticUnresolvedModdleExtensions} non-empty and escalates the
 * session to the host linter before any config would be pushed. A browser lint
 * run reports unhonourable entries as `moddleExtension:<prefix>`.
 */
export interface BpmnlintConfig {
    readonly extends?: string | readonly string[];
    readonly rules?: Readonly<Record<string, BpmnlintRuleConfig>>;
    readonly moddleExtensions?: Readonly<Record<string, unknown>>;
}

/**
 * The moddle prefixes the live bpmn-js tree already registers. The webview lints
 * the in-memory definitions (not re-parsed XML), so any `moddleExtensions` entry
 * targeting one of these is already satisfied — the typed properties the rules
 * inspect are present on the tree. Everything else cannot be honoured in a
 * browser (no `require`), so it is reported, never loaded.
 */
const LIVE_MODDLE_PREFIXES = new Set(["bpmn", "bpmndi", "dc", "di", "camunda", "zeebe", "modeler"]);

/**
 * The `moddleExtensions` a browser lint run cannot honour, in the same
 * `moddleExtension:<prefix>` form the Node linter reports. A string value is a
 * module path only Node can `require`; an object value is only usable when its
 * prefix is one the live tree already registers (otherwise its typed properties
 * were never parsed onto the model). Everything unhonourable is returned so it
 * can be merged into the run's `unresolved` list — informational, never fatal.
 *
 * Shared verbatim by the webview (merged into every in-page run's `unresolved`)
 * and the host ({@link BpmnLintConfigService} escalates to the Node linter
 * without a round trip whenever this returns non-empty). Identical logic on both
 * sides *is* the parity guarantee — the engine-blind `zeebe`/`camunda` and
 * possibly-unregistered `modeler` caveats are intentional and must stay in sync.
 */
export function staticUnresolvedModdleExtensions(config: BpmnlintConfig): string[] {
    const declared = config.moddleExtensions;
    if (!declared || typeof declared !== "object") {
        return [];
    }
    const unresolved: string[] = [];
    for (const [prefix, value] of Object.entries(declared)) {
        const honoured =
            value != null && typeof value === "object" && LIVE_MODDLE_PREFIXES.has(prefix);
        if (!honoured) {
            unresolved.push(`moddleExtension:${prefix}`);
        }
    }
    return unresolved;
}

/**
 * Outbound notification payload for one lint pass (the `onLintResults` event):
 * the findings the overlay renders plus the rule names that could not be
 * resolved from the supplied {@link BpmnlintConfig}. `unresolved` is how the
 * modeler reports graceful degradation instead of failing the whole run when a
 * `{ config }` references a rule the bundled resolver does not carry. Emitted
 * only after an in-page run — never for an external push, so a host feeding
 * the webview its own results does not echo them back.
 */
export interface LintRunEvent {
    readonly results: LintResults;
    readonly unresolved: readonly string[];
}
