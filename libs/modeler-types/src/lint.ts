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
