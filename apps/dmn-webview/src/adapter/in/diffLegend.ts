import { i18n } from "@miragon/bpmn-modeler-i18n";
import type { DiffCounts, DiffSide } from "@miragon/bpmn-modeler-types";

import { DIFF_TEXTS } from "../../domain/diffTexts";

export interface DiffLegendState {
    /** The open view's counts; a view without a changed table shows `status` instead. */
    readonly counts?: DiffCounts;
    readonly status?: "added" | "removed" | "changed";
    /** Shown above the counts on compare-files panes, where the tab names both files. */
    readonly filename?: string;
    readonly showSwap: boolean;
    readonly canStep: boolean;
}

export interface DiffLegendActions {
    readonly onPrevious: () => void;
    readonly onNext: () => void;
    readonly onSwap: () => void;
}

const COUNT_KINDS = [
    ["added", DIFF_TEXTS.added],
    ["removed", DIFF_TEXTS.removed],
    ["changed", DIFF_TEXTS.changed],
    ["layoutChanged", DIFF_TEXTS.moved],
] as const;

/**
 * The floating chip above a DMN diff pane: the open view's counts, Previous
 * and Next, and on compare-files panes the file name and a swap button. It
 * re-renders in the user's language.
 */
export class DiffLegend {
    private readonly root: HTMLElement;
    private state?: DiffLegendState;
    private readonly stopTranslating: () => void;
    private readonly sizeObserver?: ResizeObserver;

    constructor(
        parent: HTMLElement,
        private readonly actions: DiffLegendActions,
    ) {
        this.root = element("div", "dmn-diff dmn-diff-legend");
        this.root.setAttribute("role", "toolbar");
        this.root.hidden = true;
        parent.append(this.root);
        this.stopTranslating = i18n.onChange(() => this.render());
        // The views below leave room for the chip, which wraps on a narrow pane.
        if (typeof ResizeObserver !== "undefined") {
            this.sizeObserver = new ResizeObserver(() => {
                const height = this.root.hidden ? 0 : this.root.offsetHeight;
                document.body.style.setProperty("--dmn-diff-chrome-height", `${height}px`);
            });
            this.sizeObserver.observe(this.root);
        }
    }

    update(state: DiffLegendState): void {
        this.state = state;
        this.render();
    }

    dispose(): void {
        this.stopTranslating();
        this.sizeObserver?.disconnect();
        this.root.remove();
    }

    private render(): void {
        const state = this.state;
        if (!state) return;
        this.root.hidden = false;
        this.root.setAttribute("aria-label", i18n.translate(DIFF_TEXTS.changes));
        const row = element("div", "dmn-diff-legend__row");
        if (state.status) {
            row.append(swatchLabel(state.status, i18n.translate(DIFF_TEXTS[state.status])));
        }
        if (state.counts) {
            for (const [kind, label] of COUNT_KINDS) {
                const slot = swatchLabel(kind, `${i18n.translate(label)} `);
                slot.append(element("b", "", String(state.counts[kind])));
                row.append(slot);
            }
        }
        const nav = element("span", "dmn-diff-legend__group");
        nav.append(
            button(
                "dmn-diff-legend__previous",
                `‹ ${i18n.translate(DIFF_TEXTS.previous)}`,
                !state.canStep,
                this.actions.onPrevious,
            ),
            button(
                "dmn-diff-legend__next",
                `${i18n.translate(DIFF_TEXTS.next)} ›`,
                !state.canStep,
                this.actions.onNext,
            ),
        );
        row.append(nav);
        if (state.showSwap) {
            const swap = element("span", "dmn-diff-legend__group");
            const swapButton = button("dmn-diff-legend__swap", "⇄", false, this.actions.onSwap);
            swapButton.title = i18n.translate(DIFF_TEXTS.swap);
            swapButton.setAttribute("aria-label", swapButton.title);
            swap.append(swapButton);
            row.append(swap);
        }
        const children: HTMLElement[] = [];
        if (state.filename) {
            children.push(element("div", "dmn-diff-legend__file", state.filename));
        }
        children.push(row);
        this.root.replaceChildren(...children);
    }
}

/**
 * The card a pane shows instead of a decision's view when its version lacks
 * the decision the partner pane opened.
 */
export class DiffEmptyState {
    private readonly root: HTMLElement;
    private side?: DiffSide;
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

    /** Shows the card for the side this pane is, or hides it. */
    show(side: DiffSide | undefined): void {
        this.side = side;
        this.render();
    }

    dispose(): void {
        this.stopTranslating();
        this.root.remove();
    }

    private render(): void {
        const side = this.side;
        this.root.hidden = side === undefined;
        document.body.classList.toggle("dmn-diff-page--missing", side !== undefined);
        if (side === undefined) return;
        const card = element("div", "dmn-diff-empty__card");
        card.dataset.kind = side === "after" ? "removed" : "added";
        card.append(
            element("div", "dmn-diff-empty__mark"),
            element("div", "dmn-diff-empty__title", i18n.translate(DIFF_TEXTS.notInVersion)),
            element(
                "div",
                "dmn-diff-empty__text",
                i18n.translate(side === "after" ? DIFF_TEXTS.removedHere : DIFF_TEXTS.addedHere),
            ),
            button(
                "dmn-diff-legend__next",
                i18n.translate(DIFF_TEXTS.viewDrd),
                false,
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

function swatchLabel(kind: string, label: string): HTMLElement {
    const slot = element("span", "dmn-diff-legend__slot");
    const swatch = element("i", "dmn-diff-legend__swatch");
    swatch.dataset.kind = kind;
    slot.append(swatch, label);
    return slot;
}

function button(
    className: string,
    label: string,
    disabled: boolean,
    onClick: () => void,
): HTMLButtonElement {
    const node = element("button", className, label);
    node.type = "button";
    node.disabled = disabled;
    node.addEventListener("click", onClick);
    return node;
}
