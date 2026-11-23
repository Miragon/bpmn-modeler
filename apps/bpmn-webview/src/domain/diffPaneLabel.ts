import { type DiffOrigin, diffOriginSupports } from "@miragon/bpmn-modeler-types/domain";

/** What a diff pane knows to name itself. */
export interface DiffPaneLabelFacts {
    readonly origin: DiffOrigin;
    readonly paneFilename: string;
}

/** A diff pane's label: a compare-files pane's file, which the tab title does not tell apart, or none where the tab title names it. */
export function diffPaneLabel(facts: DiffPaneLabelFacts): string | undefined {
    return diffOriginSupports(facts.origin, "namesFiles") ? facts.paneFilename : undefined;
}
