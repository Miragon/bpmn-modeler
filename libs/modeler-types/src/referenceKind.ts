/** The model a BPMN element references: a called process, a decision or a linked Camunda Form. */
export type ReferenceKind = "process" | "decision" | "form";

/**
 * What a reference kind supports. Every rule on a reference kind lives here or in a
 * `Record<ReferenceKind, …>` lookup, so code asks {@link referenceKindSupports} instead of
 * comparing a {@link ReferenceKind} value.
 */
export interface ReferenceKindCapabilities {
    /**
     * The host reports which forms the workspace declares, so only a form reference is
     * shown as unavailable; a process or decision is looked up when it is navigated to.
     */
    readonly availabilityStatus: boolean;
    /** Only a linked form opens in a read-only preview. */
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

/** The extension of the files that declare a referenced model. */
export const REFERENCED_MODEL_FILE_EXTENSION: Readonly<Record<ReferenceKind, string>> = {
    process: ".bpmn",
    decision: ".dmn",
    form: ".form",
};
