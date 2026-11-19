import { flowNameText } from "./mergeTexts";
import type { MergeTranslate } from "./mergeTranslate";

/** What a pane knows to name an element: its name, and a flow's ends. */
export interface MergeElementNaming {
    readonly id: string;
    readonly name?: string;
    readonly flowEnds?: {
        readonly source: MergeElementNaming;
        readonly target: MergeElementNaming;
    };
}

/**
 * How a merge pane names an element: by its name; an unnamed flow by its
 * ends ("Flow from Order received to Send invoice"), as a flow's id says
 * nothing to the user; anything else by its id.
 */
export function mergeElementLabel(element: MergeElementNaming, translate: MergeTranslate): string {
    const name = element.name?.trim();
    if (name) return name;
    if (element.flowEnds) {
        return flowNameText(
            mergeElementLabel(element.flowEnds.source, translate),
            mergeElementLabel(element.flowEnds.target, translate),
            translate,
        );
    }
    return element.id;
}
