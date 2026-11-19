import type { MergeSources } from "./buildMergedSources";
import type { HandMergedVersion } from "./handMerge";
import { type ElementVersion, type MergeElement, type MergeSide, sameLanes } from "./mergeResult";
import { type SideText, sideNameOf, sideTextOf } from "./sideText";

/** One own attribute whose value differs between the sides; a side without it has none. */
export interface ValueDifference {
    readonly attribute: string;
    readonly current?: string;
    readonly incoming?: string;
}

/** What two sides hold of an element no canvas draws, so the user sees what a pick decides. */
export interface ShapelessValues {
    /** Set where current holds the element. */
    readonly current?: { readonly name?: string };
    /** Set where incoming holds the element. */
    readonly incoming?: { readonly name?: string };
    /** The own attributes whose values differ where both sides hold the element. */
    readonly differences: readonly ValueDifference[];
    /** More than those attributes differs, such as a child, the parent or the lanes. */
    readonly moreDiffers?: true;
}

/** What the values are read from, parsed once per merge. */
export type ShapelessValueSources = Pick<MergeSources, "names" | "snapshots" | "handMergeTexts">;

const NO_VALUES: Readonly<Record<string, string>> = {};

/**
 * Each side's presence and name and, where both sides hold the element, the
 * own attributes whose values differ, compared as text, and whether anything
 * beyond them differs. The base's values are not shown, so they are not read;
 * why a side lacks the element is the row's `lackingSide`. A version merged by
 * hand stands for its side's own.
 */
export function shapelessValuesOf(
    sources: ShapelessValueSources,
    element: MergeElement,
    handMerge?: HandMergedVersion,
): ShapelessValues {
    const valuesOf = (side: MergeSide) =>
        sideTextOf(sources.snapshots, handMerge, element.id, side);
    const held = (side: MergeSide) => {
        const name = sideNameOf(sources.names, handMerge, element.id, side);
        return element.versions[side] === undefined
            ? undefined
            : name === undefined
              ? {}
              : { name };
    };
    const currentSide = held("current");
    const incomingSide = held("incoming");
    const { current, incoming } = element.versions;
    return {
        ...(currentSide === undefined ? {} : { current: currentSide }),
        ...(incomingSide === undefined ? {} : { incoming: incomingSide }),
        ...(current === undefined || incoming === undefined
            ? { differences: [] }
            : comparedSides(valuesOf("current"), valuesOf("incoming"), current, incoming)),
    };
}

function comparedSides(
    currentSnapshot: SideText | undefined,
    incomingSnapshot: SideText | undefined,
    current: ElementVersion,
    incoming: ElementVersion,
): Pick<ShapelessValues, "differences" | "moreDiffers"> {
    const currentValues = currentSnapshot?.attributes ?? NO_VALUES;
    const incomingValues = incomingSnapshot?.attributes ?? NO_VALUES;
    const attributes = new Set([...Object.keys(currentValues), ...Object.keys(incomingValues)]);
    const differences = [...attributes]
        .filter((attribute) => currentValues[attribute] !== incomingValues[attribute])
        .map((attribute): ValueDifference => {
            const currentValue = currentValues[attribute];
            const incomingValue = incomingValues[attribute];
            return {
                attribute,
                ...(currentValue === undefined ? {} : { current: currentValue }),
                ...(incomingValue === undefined ? {} : { incoming: incomingValue }),
            };
        });
    const moreDiffers =
        current.parent !== incoming.parent ||
        current.container !== incoming.container ||
        !sameLanes(current.lanes, incoming.lanes) ||
        contentBeyondOwnValues(currentSnapshot?.content) !==
            contentBeyondOwnValues(incomingSnapshot?.content);
    return moreDiffers ? { differences, moreDiffers: true } : { differences };
}

/**
 * The element's XML without the attributes of its own tag, which are its own
 * values: the rest is its children. The serializer escapes `>` in attribute
 * values, so the first `>` closes the tag.
 */
function contentBeyondOwnValues(content: string | undefined): string | undefined {
    return content?.replace(/^<([^\s/>]+)[^>]*?(\/?)>/, "<$1$2>");
}
