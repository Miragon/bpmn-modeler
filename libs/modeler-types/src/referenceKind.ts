/** The model a BPMN element references: a called process, a decision or a linked Camunda Form. */
export type ReferenceKind = "process" | "decision" | "form";

// Keyed by the union, so a member added to or dropped from the type fails to compile here.
const REFERENCE_KINDS: Readonly<Record<ReferenceKind, true>> = {
    process: true,
    decision: true,
    form: true,
};

export function isReferenceKind(value: unknown): value is ReferenceKind {
    return (
        typeof value === "string" && Object.prototype.hasOwnProperty.call(REFERENCE_KINDS, value)
    );
}
