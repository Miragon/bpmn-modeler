/**
 * Discriminates how a task's Camunda implementation reference must be resolved
 * to a workspace source file. The webview classifies the selected element's
 * reference; the host picks the matching resolution strategy per kind.
 *
 * - `javaClass` — `camunda:class` FQCN → deterministic class-file glob.
 * - `delegateExpression` — `camunda:delegateExpression="${bean}"` → bean id → class.
 * - `expression` — `camunda:expression="${svc.run()}"` → leading id → class (lowest confidence).
 * - `externalTopic` — C7 external-task `camunda:topic` → content search for the literal.
 * - `jobType` — C8 `zeebe:taskDefinition type` → content search for the literal.
 */
export type ImplementationKind =
    | "javaClass"
    | "delegateExpression"
    | "expression"
    | "externalTopic"
    | "jobType";

/**
 * One task's implementation binding as the webview reads it from the bpmn-js
 * model: the activity's id plus the {@link ImplementationKind} / reference the
 * host needs to resolve it to a source file.
 *
 * The host never parses the BPMN XML — bpmn-js has already parsed it for
 * rendering, so the webview extracts these cheap strings and ships the list,
 * keeping the (possibly huge) XML out of the host entirely.
 */
export interface ImplementationEntry {
    readonly activityId: string;
    readonly kind: ImplementationKind;
    readonly reference: string;
}

/**
 * Composite key for `ImplementationStatusQuery`'s lookup, shared by both
 * sides of the protocol so they agree byte-for-byte. The reference is part of
 * the key on purpose — a bare activity id would briefly reuse a stale
 * resolution after a reference edit.
 */
export function implementationStatusKey(activityId: string, reference: string): string {
    return `${activityId}::${reference}`;
}
