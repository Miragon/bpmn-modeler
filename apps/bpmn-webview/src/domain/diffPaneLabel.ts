import {
    type DiffOrigin,
    diffOriginSupports,
    type MergeSideCaption,
} from "@miragon/bpmn-modeler-types";

import { mergeCaptionText } from "./mergeTexts";

/** What a diff pane knows to name itself. */
export interface DiffPaneLabelFacts {
    readonly origin: DiffOrigin;
    readonly paneFilename: string;
    readonly mergeCaption?: MergeSideCaption;
}

/**
 * A diff pane's label: a merge pane's caption, a compare-files pane's file,
 * which the tab title does not tell apart, or none where the tab title names it.
 */
export function diffPaneLabel(
    facts: DiffPaneLabelFacts,
    translate: (key: string) => string,
): string | undefined {
    if (facts.mergeCaption) return mergeCaptionText(facts.mergeCaption, translate);
    return diffOriginSupports(facts.origin, "namesFiles") ? facts.paneFilename : undefined;
}
