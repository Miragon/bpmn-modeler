import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    createButton,
    createElement,
    type DiffLegendActions as SharedDiffLegendActions,
    DiffLegendView,
} from "@miragon/bpmn-modeler-types";

import type { DiffLegendState } from "../../domain/diffPaneState";
import type { DmnMissingStatus } from "../../domain/diffSteps";
import { DMN_DIFF_TEXTS } from "../../domain/diffTexts";

export type DiffLegendActions = Required<SharedDiffLegendActions>;

const MISSING_TEXTS: Readonly<Record<DmnMissingStatus, string>> = {
    removed: DMN_DIFF_TEXTS.removedHere,
    added: DMN_DIFF_TEXTS.addedHere,
};

/**
 * The shared diff legend over a DMN diff pane, which also tells the views
 * below how much room it takes.
 */
export class DiffLegend {
    private readonly view: DiffLegendView;

    constructor(parent: HTMLElement, actions: DiffLegendActions) {
        this.view = new DiffLegendView(parent, actions, i18n);
        // The views below leave room for the bar, which wraps on a narrow pane.
        this.view.reserveRoomOn(document.body);
    }

    update(state: DiffLegendState): void {
        this.view.update(state);
    }

    dispose(): void {
        this.view.destroy();
    }
}

/**
 * The card a pane shows instead of a decision's view when its version lacks
 * the decision the partner pane opened.
 */
export class DiffEmptyState {
    private readonly root: HTMLElement;
    private status?: DmnMissingStatus;
    private readonly stopTranslating: () => void;

    constructor(
        parent: HTMLElement,
        private readonly onViewDrd: () => void,
    ) {
        this.root = createElement("div", "dmn-diff dmn-diff-empty");
        this.root.hidden = true;
        parent.append(this.root);
        this.stopTranslating = i18n.onChange(() => this.render());
    }

    /** Shows the card for how the missing decision differs, or hides it. */
    show(status: DmnMissingStatus | undefined): void {
        this.status = status;
        this.render();
    }

    dispose(): void {
        this.stopTranslating();
        this.root.remove();
    }

    private render(): void {
        const status = this.status;
        this.root.hidden = status === undefined;
        document.body.classList.toggle("dmn-diff-page--missing", status !== undefined);
        if (status === undefined) return;
        const card = createElement("div", "dmn-diff-empty__card diff-legend-theme");
        card.dataset.kind = status;
        card.append(
            createElement("div", "dmn-diff-empty__mark"),
            createElement(
                "div",
                "dmn-diff-empty__title",
                i18n.translate(DMN_DIFF_TEXTS.notInVersion),
            ),
            createElement("div", "dmn-diff-empty__text", i18n.translate(MISSING_TEXTS[status])),
            createButton(
                "dmn-diff-empty__action",
                this.onViewDrd,
                i18n.translate(DMN_DIFF_TEXTS.viewDrd),
            ),
        );
        this.root.replaceChildren(card);
    }
}
