import type { MergeResultComparison } from "@miragon/bpmn-modeler-shared";
import { createButton, createElement, type MergeSide } from "@miragon/bpmn-modeler-types";

import { compareWithText, comparisonText, type MergeTranslate } from "../../domain/mergeTexts";

const OTHER_SIDE: Record<MergeSide, MergeSide> = { current: "incoming", incoming: "current" };

/**
 * The part of a diff pane's bar that a built merge result compared with one
 * side adds: which side it is, and the switch to the other side where the
 * host offers it. Hidden on any other diff.
 */
export class ResultComparisonSwitch {
    private readonly label = createElement("span", "diff-legend__comparison");
    private readonly switchButton: HTMLButtonElement;
    private comparison?: MergeResultComparison;

    constructor(
        private readonly parent: HTMLElement,
        onSwitch: () => void,
        private readonly translate: MergeTranslate,
    ) {
        this.switchButton = createButton("diff-legend__nav-btn diff-legend__comparison-switch", () => {
            if (this.comparison?.canSwitch) onSwitch();
        });
        parent.append(this.label, this.switchButton);
        parent.hidden = true;
    }

    update(comparison: MergeResultComparison | undefined): void {
        this.comparison = comparison;
        this.render();
    }

    render(): void {
        const comparison = this.comparison;
        this.parent.hidden = comparison === undefined;
        if (!comparison) return;
        this.label.textContent = comparisonText(comparison.against, this.translate);
        this.switchButton.hidden = !comparison.canSwitch;
        // The switch is named after what it opens, as the merge legend's buttons are.
        this.switchButton.textContent = compareWithText(
            OTHER_SIDE[comparison.against],
            this.translate,
        );
    }
}
