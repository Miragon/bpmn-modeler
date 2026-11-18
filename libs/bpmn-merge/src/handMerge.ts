import { isPickContainerType } from "./mergeDecisionsContainment";
import type { ElementVersion, MergeSide } from "./mergeResult";

/**
 * What a hand-merged text may change: everything of the element but the
 * elements inside it, or, for a container, its start tag, documentation and
 * extension elements; its children, lane sets and ioSpecification follow the pick.
 */
export type HandMergeScope = "ownContent" | "ownAttributes";

export function handMergeScopeOf(type: string): HandMergeScope {
    return isPickContainerType(type) ? "ownAttributes" : "ownContent";
}

/** A picked element's version merged by hand from the texts of base, current and incoming. */
export interface HandMergedVersion {
    readonly id: string;
    /** The picked side, which gives everything outside the scope. */
    readonly side: MergeSide;
    readonly scope: HandMergeScope;
    /** The compared text, as `ElementSnapshot.content` writes it. */
    readonly content: string;
    /** The start tag's attributes by name, as `ElementSnapshot.attributes` writes them. */
    readonly attributes: Readonly<Record<string, string>>;
    readonly version: ElementVersion;
}

/** Why a hand-merged text is not taken; the decisions stay as they were. */
export type HandMergeRefusal =
    | { readonly kind: "conflictMarkersLeft" }
    | { readonly kind: "unparsable"; readonly detail: string }
    | { readonly kind: "notOneElement"; readonly found: number }
    | { readonly kind: "typeChanged"; readonly expected: string; readonly found: string }
    | { readonly kind: "idChanged"; readonly expected: string; readonly found?: string }
    | { readonly kind: "holdsElementsOfTheirOwn"; readonly ids: readonly string[] }
    | { readonly kind: "beyondOwnAttributes"; readonly properties: readonly string[] }
    | { readonly kind: "unknownNamespace"; readonly namespaces: readonly string[] }
    | { readonly kind: "rejectedByEngine"; readonly detail: string }
    /** An edge end, a boundary event's host or a pool's process differs from the picked side's. */
    | { readonly kind: "changesStructure"; readonly properties: readonly string[] }
    /** No version holds these ids. */
    | { readonly kind: "namesMissingElement"; readonly ids: readonly string[] }
    /** A version holds these elements, or the parts inside them, but the result leaves them out. */
    | { readonly kind: "namesLeftOutElement"; readonly ids: readonly string[] }
    /** Taking the text would pull in, drop or reopen these elements. */
    | { readonly kind: "changesOtherDecisions"; readonly ids: readonly string[] }
    /** The element is no longer picked on the side the text was merged for, or has no three versions to merge. */
    | { readonly kind: "notHandMergeable" };

export type HandMergeOutcome =
    { readonly applied: true } | { readonly applied: false; readonly refusal: HandMergeRefusal };

export const HAND_MERGE_APPLIED: HandMergeOutcome = { applied: true };

export function handMergeRefused(refusal: HandMergeRefusal): HandMergeOutcome {
    return { applied: false, refusal };
}

/** The English default; a view may describe the same refusal in its own words. */
export function describeHandMergeRefusal(refusal: HandMergeRefusal): string {
    switch (refusal.kind) {
        case "conflictMarkersLeft":
            return "The text still holds conflict markers.";
        case "unparsable":
            return `The text does not parse: ${refusal.detail}`;
        case "notOneElement":
            return `The text holds ${refusal.found} elements at its top level instead of one.`;
        case "typeChanged":
            return `The text is a ${refusal.found}, not a ${refusal.expected}.`;
        case "idChanged":
            return refusal.found === undefined
                ? `The text has no id; it must keep ${refusal.expected}.`
                : `The text has the id ${refusal.found}; it must keep ${refusal.expected}.`;
        case "holdsElementsOfTheirOwn":
            return `The text holds elements merged on their own: ${refusal.ids.join(", ")}.`;
        case "beyondOwnAttributes":
            return `For a container only its attributes, documentation and extension elements merge by hand, not ${refusal.properties.join(", ")}.`;
        case "unknownNamespace":
            return `No version declares the namespace ${refusal.namespaces.join(", ")}.`;
        case "rejectedByEngine":
            return `The engine's descriptor does not take the text as written: ${refusal.detail}`;
        case "changesStructure":
            return `The text changes ${refusal.properties.join(", ")}, which follow the pick.`;
        case "namesMissingElement":
            return `The text names ${refusal.ids.join(", ")}, which no version has.`;
        case "namesLeftOutElement":
            return `The text names ${refusal.ids.join(", ")}, which the result leaves out.`;
        case "changesOtherDecisions":
            return `Taking the text would change the decisions on ${refusal.ids.join(", ")}.`;
        case "notHandMergeable":
            return "The element is no longer picked on the side the text was merged for.";
    }
}
