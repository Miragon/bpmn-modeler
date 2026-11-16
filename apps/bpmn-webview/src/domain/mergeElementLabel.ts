import { flowNameText, type MergeTranslate } from "./mergeTexts";

/** What a pane knows to name an element: its name, and the names of a flow's ends. */
export interface MergeElementNaming {
    readonly id: string;
    readonly name?: string;
    readonly flowEnds?: { readonly source: string; readonly target: string };
}

/**
 * How the merge view names an element: by its name; an unnamed flow by its
 * ends ("Flow from 7 days to Send reminder email"), as a flow's id says
 * nothing to the user; anything else by its id.
 */
export function mergeElementLabel(element: MergeElementNaming, translate: MergeTranslate): string {
    const name = element.name?.trim();
    if (name) return name;
    if (element.flowEnds) {
        return flowNameText(element.flowEnds.source, element.flowEnds.target, translate);
    }
    return element.id;
}
