import type { DiffCategory, DiffCounts } from "./diff";
import { DIFF_CATEGORIES, DIFF_CATEGORY_LABELS, DIFF_LEGEND_TEXTS } from "./diffVocabulary";
import { createButton, createElement } from "./dom";

/** The translator the legend renders its words with, such as `@miragon/bpmn-modeler-i18n`'s `i18n`. */
export interface DiffLegendTranslator {
    translate(key: string): string;
    /** Calls `listener` when the language changes; returns the unsubscribe. */
    onChange(listener: () => void): () => void;
}

export interface DiffLegendActions {
    readonly onPrevious: () => void;
    readonly onNext: () => void;
    /** Without it the legend never shows the swap button. */
    readonly onSwap?: () => void;
    /** Without it the legend never shows Show all. */
    readonly onShowAll?: () => void;
}

/** What one diff legend shows. */
export interface DiffLegendState {
    /** One slot per category; omitted when `status` names the open view's single change. */
    readonly counts?: DiffCounts;
    readonly status?: DiffCategory;
    /** Shown above the counts on compare-files panes, where the tab names both files. */
    readonly filename?: string;
    readonly showSwap: boolean;
    readonly canStep: boolean;
    /** `false` leaves an empty bar, for a pane whose partner's bar shows the changes. */
    readonly showChanges?: boolean;
    /** The change the stepper is on, counted from 0; omitted before the first step. */
    readonly position?: { readonly index: number; readonly total: number };
}

// Published styling hooks: the BPMN viewer's consumers select the swatches by these modifiers.
const SLOT_MODIFIERS: Readonly<Record<DiffCategory, string>> = {
    added: "added",
    removed: "removed",
    changed: "changed",
    layoutChanged: "layout",
};

interface CountSlot {
    readonly category: DiffCategory;
    readonly slot: HTMLElement;
    readonly label: Text;
    readonly count: HTMLElement;
}

interface StatusSlot {
    readonly slot: HTMLElement;
    readonly swatch: HTMLElement;
    readonly label: Text;
}

/**
 * The bar both diffs put along the top of a pane, styled by `diffLegend.css`:
 * the categories that changed with their swatches, or a status chip for a
 * single change, Previous and Next with the position, and on compare-files
 * panes the file name and a swap button. Hidden until the first
 * {@link update}; re-renders its words when the language changes.
 */
export class DiffLegendView {
    private static readonly CHEVRON_LEFT = "m15 18-6-6 6-6";
    private static readonly CHEVRON_RIGHT = "m9 18 6-6-6-6";

    readonly element = createElement("div", "diff-legend");

    private readonly filename = createElement("div", "diff-legend__filename");
    private readonly countsRow = createElement("div", "diff-legend__counts");
    // Created on the first status, so a legend that only ever counts keeps its published DOM.
    private status?: StatusSlot;
    private readonly countSlots = DIFF_CATEGORIES.map((category) =>
        DiffLegendView.countSlot(category),
    );
    private readonly none = createElement("span", "diff-legend__none");
    private readonly previousButton: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;
    private readonly position = createElement("span", "diff-legend__position");
    private readonly showAllButton: HTMLButtonElement;
    private readonly swapGroup = createElement("div", "diff-legend__swap-group");
    // Shares the nav buttons' class so both groups align and theme alike.
    private readonly swapButton: HTMLButtonElement;
    private readonly stopTranslating: () => void;
    private state?: DiffLegendState;

    constructor(
        parent: HTMLElement,
        private readonly actions: DiffLegendActions,
        private readonly translator: DiffLegendTranslator,
    ) {
        this.previousButton = DiffLegendView.iconButton(
            "diff-legend__prev-btn",
            DiffLegendView.CHEVRON_LEFT,
            actions.onPrevious,
        );
        this.nextButton = DiffLegendView.iconButton(
            "diff-legend__next-btn",
            DiffLegendView.CHEVRON_RIGHT,
            actions.onNext,
        );
        this.showAllButton = createButton("diff-legend__nav-btn diff-legend__show-all-btn", () =>
            this.actions.onShowAll?.(),
        );
        this.swapButton = createButton(
            "diff-legend__nav-btn diff-legend__swap-btn",
            () => this.actions.onSwap?.(),
            "⇄",
        );
        this.assemble();
        parent.append(this.element);
        this.renderWords();
        this.stopTranslating = translator.onChange(() => this.renderWords());
    }

    update(state: DiffLegendState): void {
        this.state = state;
        this.element.hidden = false;
        this.countsRow.hidden = state.showChanges === false;
        this.enableStepping(state.canStep);
        this.swapGroup.hidden = !(state.showSwap && this.actions.onSwap);
        this.filename.hidden = !state.filename;
        this.filename.textContent = state.filename ?? "";
        this.showStatus(state.status);
        this.showCounts(state.counts);
        this.showPosition(state.position);
        this.renderWords();
    }

    destroy(): void {
        this.stopTranslating();
        this.element.remove();
    }

    private assemble(): void {
        this.element.setAttribute("role", "toolbar");
        this.element.hidden = true;
        this.none.hidden = true;
        this.position.hidden = true;
        this.showAllButton.hidden = !this.actions.onShowAll;
        this.swapGroup.hidden = true;
        this.swapGroup.append(this.swapButton);
        const nav = createElement("div", "diff-legend__nav");
        nav.append(this.previousButton, this.nextButton, this.position, this.showAllButton);
        this.countsRow.append(
            ...this.countSlots.map(({ slot }) => slot),
            this.none,
            nav,
            this.swapGroup,
        );
        this.element.append(this.filename, this.countsRow);
    }

    private enableStepping(canStep: boolean): void {
        for (const button of [this.previousButton, this.nextButton, this.showAllButton]) {
            button.disabled = !canStep;
        }
    }

    private showStatus(status: DiffCategory | undefined): void {
        if (status) {
            this.status ??= this.prependStatusSlot();
            this.status.swatch.className = DiffLegendView.swatchClass(status);
        }
        if (this.status) {
            this.status.slot.hidden = !status;
        }
    }

    private showCounts(counts: DiffCounts | undefined): void {
        for (const { category, slot, count } of this.countSlots) {
            const changes = counts?.[category] ?? 0;
            slot.hidden = changes === 0;
            count.textContent = String(changes);
        }
        this.none.hidden = !counts || DiffLegendView.hasChanges(counts);
    }

    private showPosition(position: DiffLegendState["position"]): void {
        this.position.hidden = !position;
        this.position.textContent = position ? `${position.index + 1}/${position.total}` : "";
    }

    private prependStatusSlot(): StatusSlot {
        const status = DiffLegendView.statusSlot();
        this.countsRow.prepend(status.slot);
        return status;
    }

    private renderWords(): void {
        const translate = (key: string) => this.translator.translate(key);
        this.element.setAttribute("aria-label", translate(DIFF_LEGEND_TEXTS.changes));
        for (const { category, label } of this.countSlots) {
            label.data = `${translate(DIFF_CATEGORY_LABELS[category])} `;
        }
        const status = this.state?.status;
        if (this.status) {
            this.status.label.data = status ? translate(DIFF_CATEGORY_LABELS[status]) : "";
        }
        this.none.textContent = translate(DIFF_LEGEND_TEXTS.none);
        this.showAllButton.textContent = translate(DIFF_LEGEND_TEXTS.showAll);
        DiffLegendView.nameIconButton(this.previousButton, translate(DIFF_LEGEND_TEXTS.previous));
        DiffLegendView.nameIconButton(this.nextButton, translate(DIFF_LEGEND_TEXTS.next));
        DiffLegendView.nameIconButton(this.swapButton, translate(DIFF_LEGEND_TEXTS.swap));
    }

    private static hasChanges(counts: DiffCounts): boolean {
        return DIFF_CATEGORIES.some((category) => counts[category] > 0);
    }

    /** An icon-only button's name, for its tooltip and for screen readers. */
    private static nameIconButton(button: HTMLButtonElement, label: string): void {
        button.title = label;
        button.setAttribute("aria-label", label);
    }

    private static iconButton(
        modifier: string,
        chevronPath: string,
        onClick: () => void,
    ): HTMLButtonElement {
        const button = createButton(`diff-legend__nav-btn ${modifier}`, onClick);
        button.append(DiffLegendView.chevron(chevronPath));
        return button;
    }

    private static chevron(path: string): SVGSVGElement {
        const svgNamespace = "http://www.w3.org/2000/svg";
        const icon = document.createElementNS(svgNamespace, "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("aria-hidden", "true");
        icon.classList.add("diff-legend__icon");
        const line = document.createElementNS(svgNamespace, "path");
        line.setAttribute("d", path);
        icon.append(line);
        return icon;
    }

    private static countSlot(category: DiffCategory): CountSlot {
        const slot = createElement(
            "div",
            `diff-legend__slot diff-legend__slot--${SLOT_MODIFIERS[category]}`,
        );
        const text = createElement("span", "diff-legend__label");
        const label = document.createTextNode("");
        const count = createElement("b", "diff-legend__count");
        text.append(label, count);
        slot.append(createElement("span", DiffLegendView.swatchClass(category)), text);
        return { category, slot, label, count };
    }

    private static statusSlot(): StatusSlot {
        const slot = createElement("div", "diff-legend__slot diff-legend__slot--status");
        const swatch = createElement("span", "diff-legend__swatch");
        const text = createElement("span", "diff-legend__label");
        const label = document.createTextNode("");
        text.append(label);
        slot.append(swatch, text);
        return { slot, swatch, label };
    }

    private static swatchClass(category: DiffCategory): string {
        return `diff-legend__swatch diff-legend__swatch--${SLOT_MODIFIERS[category]}`;
    }
}
