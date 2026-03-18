/**
 * Domain types for service task → source code linking.
 *
 * An {@link ImplementationEntry} describes a single implementation reference
 * extracted from a BPMN service task (or send/business-rule task). The lookup
 * map uses the BPMN element ID (activity ID) as key.
 */

/** Discriminator for the type of implementation reference found on a BPMN task. */
export type ImplementationKind =
    | "javaClass"
    | "delegateExpression"
    | "expression"
    | "externalTask"
    | "jobType";

/**
 * Value object representing a resolved (or unresolved) implementation reference.
 *
 * Stored as the value in the per-editor lookup map, keyed by BPMN activity ID.
 */
export interface ImplementationEntry {
    /** Discriminator for the type of implementation reference. */
    readonly kind: ImplementationKind;
    /** Raw value from the BPMN XML, e.g. `"com.example.MyDelegate"` or `"payment-topic"`. */
    readonly identifier: string;
    /** Resolved absolute file path, or `undefined` if unresolved. */
    readonly filePath?: string;
    /** Display text for the webview overlay, e.g. `"MyDelegate"` or `"payment-topic"`. */
    readonly label: string;
    /** `true` when {@link filePath} points to an existing file. */
    readonly resolved: boolean;
}

/**
 * Intermediate extraction result produced by the BPMN XML parser before
 * file resolution takes place.
 */
export interface RawImplementationRef {
    /** BPMN element `id` attribute. */
    readonly activityId: string;
    /** Type of implementation reference. */
    readonly kind: ImplementationKind;
    /** Raw identifier value from the XML. */
    readonly identifier: string;
}

/**
 * A single I/O parameter extracted from the BPMN XML extension elements.
 */
export interface RawIOParameter {
    /** Parameter name. */
    readonly name: string;
    /** Whether this is an input or output parameter. */
    readonly direction: "input" | "output";
    /** Raw expression / value from the XML. */
    readonly value?: string;
}

/**
 * Full extraction result for a single activity, including implementation
 * reference and I/O parameters.
 *
 * Produced by {@link extractActivityDetails} in the XML parser.
 */
export interface RawActivityExtraction {
    /** BPMN element `id` attribute. */
    readonly activityId: string;
    /** BPMN element `name` attribute. */
    readonly activityName: string;
    /** Implementation reference, if present. */
    readonly implementation?: RawImplementationRef;
    /** Input parameters extracted from the XML. */
    readonly inputs: RawIOParameter[];
    /** Output parameters extracted from the XML. */
    readonly outputs: RawIOParameter[];
}
