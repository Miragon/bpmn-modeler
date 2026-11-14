import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    type DiffLegendActions as SharedDiffLegendActions,
    DiffLegendView,
} from "@miragon/bpmn-modeler-types";

import type { DiffLegendState } from "../../domain/diffPaneState";
import type { DmnMissingStatus } from "../../domain/diffSteps";
import { DMN_DIFF_TEXTS } from "../../domain/diffTexts";

// The DMN stepper has no way back to the whole view yet, so its bar offers no Show all.
export type DiffLegendActions = Required<Omit<SharedDiffLegendActions, "onShowAll">>;

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
    private readonly sizeObserver?: ResizeObserver;

    constructor(parent: HTMLElement, actions: DiffLegendActions) {
        this.view = new DiffLegendView(parent, actions, i18n);
        // The views below leave room for the chip, which wraps on a narrow pane.
        if (typeof ResizeObserver !== "undefined") {
            const chip = this.view.element;
            this.sizeObserver = new ResizeObserver(() => {
                const height = chip.hidden ? 0 : chip.offsetHeight;
                document.body.style.setProperty("--dmn-diff-chrome-height", `${height}px`);
            });
            this.sizeObserver.observe(chip);
        }
    }

    update(state: DiffLegendState): void {
        this.view.update(state);
    }

    dispose(): void {
        this.sizeObserver?.disconnect();
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
        this.root = element("div", "dmn-diff dmn-diff-empty");
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
        const card = element("div", "dmn-diff-empty__card diff-legend-theme");
        card.dataset.kind = status;
        card.append(
            element("div", "dmn-diff-empty__mark"),
            element("div", "dmn-diff-empty__title", i18n.translate(DMN_DIFF_TEXTS.notInVersion)),
            element("div", "dmn-diff-empty__text", i18n.translate(MISSING_TEXTS[status])),
            button(
                "dmn-diff-empty__action",
                i18n.translate(DMN_DIFF_TEXTS.viewDrd),
                this.onViewDrd,
            ),
        );
        this.root.replaceChildren(card);
    }
}

function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function button(className: string, label: string, onClick: () => void): HTMLButtonElement {
    const node = element("button", className, label);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
}
