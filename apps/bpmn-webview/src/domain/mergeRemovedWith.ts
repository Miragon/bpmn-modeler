/** How a text names what the other side removed with a kept element: one flow, flows, one boundary event, or elements. */
export type MergeRemovedWithWording = "oneFlow" | "flows" | "boundaryEvent" | "elements";

export interface MergeRemovedWith {
    readonly wording: MergeRemovedWithWording;
    /** The boundary events first, then the flows. */
    readonly elements: readonly string[];
}

/** What the other side removed with a kept element, for its restore offer and its build note alike. */
export function removedWithElement(
    connections: readonly string[],
    boundaryEvents: readonly string[] = [],
): MergeRemovedWith {
    const elements = [...boundaryEvents, ...connections];
    const one = elements.length === 1;
    if (boundaryEvents.length === 0) {
        return { wording: one ? "oneFlow" : "flows", elements };
    }
    return { wording: one ? "boundaryEvent" : "elements", elements };
}
