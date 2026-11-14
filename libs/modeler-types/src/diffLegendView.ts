import type { DiffCategory, DiffCounts } from "./diff";
import { DIFF_CATEGORIES, DIFF_CATEGORY_LABELS, DIFF_LEGEND_TEXTS } from "./diffVocabulary";

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
    readonly element: HTMLElement;

    private readonly filename: HTMLElement;
    private readonly countsRow: HTMLElement;
    // Created on the first status, so a legend that only ever counts keeps its published DOM.
    private status?: StatusSlot;
    private readonly countSlots: readonly CountSlot[];
    private readonly none: HTMLElement;
    private readonly position: HTMLElement;
    private readonly showAllButton: HTMLButtonElement;
    private readonly previousButton: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;
    private readonly swapGroup: HTMLElement;
    private readonly swapButton: HTMLButtonElement;
    private readonly stopTranslating: () => void;
    private state?: DiffLegendState;

    constructor(
        parent: HTMLElement,
        private readonly actions: DiffLegendActions,
        private readonly translator: DiffLegendTranslator,
    ) {
        this.element = element("div", "diff-legend");
        this.element.setAttribute("role", "toolbar");
        this.element.hidden = true;

        this.filename = element("div", "diff-legend__filename");
        this.countsRow = element("div", "diff-legend__counts");
        this.element.append(this.filename, this.countsRow);

        this.countSlots = DIFF_CATEGORIES.map(countSlot);
        this.none = element("span", "diff-legend__none");
        this.none.hidden = true;
        this.countsRow.append(...this.countSlots.map(({ slot }) => slot), this.none);

        this.previousButton = button(
            "diff-legend__nav-btn diff-legend__prev-btn",
            actions.onPrevious,
        );
        this.previousButton.append(chevron(CHEVRON_LEFT));
        this.nextButton = button("diff-legend__nav-btn diff-legend__next-btn", actions.onNext);
        this.nextButton.append(chevron(CHEVRON_RIGHT));
        this.position = element("span", "diff-legend__position");
        this.position.hidden = true;
        this.showAllButton = button("diff-legend__nav-btn diff-legend__show-all-btn", () =>
            this.actions.onShowAll?.(),
        );
        this.showAllButton.hidden = !actions.onShowAll;
        const nav = element("div", "diff-legend__nav");
        nav.append(this.previousButton, this.nextButton, this.position, this.showAllButton);

        // Shares the nav buttons' class so both groups align and theme alike.
        this.swapButton = button("diff-legend__nav-btn diff-legend__swap-btn", () =>
            this.actions.onSwap?.(),
        );
        this.swapButton.textContent = "⇄";
        this.swapGroup = element("div", "diff-legend__swap-group");
        this.swapGroup.hidden = true;
        this.swapGroup.append(this.swapButton);
        this.countsRow.append(nav, this.swapGroup);

        parent.append(this.element);
        this.renderWords();
        this.stopTranslating = translator.onChange(() => this.renderWords());
    }

    update(state: DiffLegendState): void {
        this.state = state;
        this.element.hidden = false;
        this.countsRow.hidden = state.showChanges === false;
        this.previousButton.disabled = !state.canStep;
        this.nextButton.disabled = !state.canStep;
        this.showAllButton.disabled = !state.canStep;
        this.swapGroup.hidden = !(state.showSwap && this.actions.onSwap);
        this.filename.hidden = !state.filename;
        this.filename.textContent = state.filename ?? "";
        if (state.status) {
            this.status ??= this.prependStatusSlot();
            this.status.swatch.className = swatchClass(state.status);
        }
        if (this.status) {
            this.status.slot.hidden = !state.status;
        }
        for (const { category, slot, count } of this.countSlots) {
            const changes = state.counts?.[category] ?? 0;
            slot.hidden = changes === 0;
            count.textContent = String(changes);
        }
        this.none.hidden = !state.counts || hasChanges(state.counts);
        this.position.hidden = !state.position;
        this.position.textContent = state.position
            ? `${state.position.index + 1}/${state.position.total}`
            : "";
        this.renderWords();
    }

    destroy(): void {
        this.stopTranslating();
        this.element.remove();
    }

    private prependStatusSlot(): StatusSlot {
        const status = statusSlot();
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
        name(this.previousButton, translate(DIFF_LEGEND_TEXTS.previous));
        name(this.nextButton, translate(DIFF_LEGEND_TEXTS.next));
        name(this.swapButton, translate(DIFF_LEGEND_TEXTS.swap));
    }
}

const CHEVRON_LEFT = "m15 18-6-6 6-6";
const CHEVRON_RIGHT = "m9 18 6-6-6-6";

function hasChanges(counts: DiffCounts): boolean {
    return DIFF_CATEGORIES.some((category) => counts[category] > 0);
}

/** An icon-only button's name, for its tooltip and for screen readers. */
function name(node: HTMLButtonElement, label: string): void {
    node.title = label;
    node.setAttribute("aria-label", label);
}

function chevron(path: string): SVGSVGElement {
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

function countSlot(category: DiffCategory): CountSlot {
    const slot = element("div", `diff-legend__slot diff-legend__slot--${SLOT_MODIFIERS[category]}`);
    const text = element("span", "diff-legend__label");
    const label = document.createTextNode("");
    const count = element("b", "diff-legend__count");
    text.append(label, count);
    slot.append(element("span", swatchClass(category)), text);
    return { category, slot, label, count };
}

function statusSlot(): StatusSlot {
    const slot = element("div", "diff-legend__slot diff-legend__slot--status");
    const swatch = element("span", "diff-legend__swatch");
    const text = element("span", "diff-legend__label");
    const label = document.createTextNode("");
    text.append(label);
    slot.append(swatch, text);
    return { slot, swatch, label };
}

function swatchClass(category: DiffCategory): string {
    return `diff-legend__swatch diff-legend__swatch--${SLOT_MODIFIERS[category]}`;
}

function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = className;
    return node;
}

function button(className: string, onClick: () => void): HTMLButtonElement {
    const node = element("button", className);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
}
