/** The model a BPMN element references: a called process, a decision or a linked Camunda Form. */
export type ReferenceKind = "process" | "decision" | "form";

/**
 * What a reference kind supports. Every rule on a reference kind lives here or in a
 * `Record<ReferenceKind, …>` lookup, so code asks {@link referenceKindSupports} instead of
 * comparing a {@link ReferenceKind} value.
 *
 * Both capabilities are served by form-only stores (the host's form index and the form
 * preview), so a kind that gains one needs its own store first.
 */
export interface ReferenceKindCapabilities {
    /**
     * The host reports whether the workspace declares the referenced model; without it, the
     * model is looked up when it is navigated to.
     */
    readonly availabilityStatus: boolean;
    /** The referenced model opens in a read-only preview. */
    readonly preview: boolean;
}

export type ReferenceKindCapability = keyof ReferenceKindCapabilities;

// Keyed by the union, so a member added to or dropped from the type fails to compile here.
const REFERENCE_KIND_CAPABILITIES: Readonly<Record<ReferenceKind, ReferenceKindCapabilities>> = {
    process: { availabilityStatus: false, preview: false },
    decision: { availabilityStatus: false, preview: false },
    form: { availabilityStatus: true, preview: true },
};

export function isReferenceKind(value: unknown): value is ReferenceKind {
    return (
        typeof value === "string" &&
        Object.prototype.hasOwnProperty.call(REFERENCE_KIND_CAPABILITIES, value)
    );
}

export function referenceKindSupports(
    kind: ReferenceKind,
    capability: ReferenceKindCapability,
): boolean {
    return REFERENCE_KIND_CAPABILITIES[kind][capability];
}
