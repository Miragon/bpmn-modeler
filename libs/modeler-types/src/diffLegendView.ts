import type { DiffCategory } from "./diff";
import { DIFF_CATEGORIES, DIFF_CATEGORY_LABELS, DIFF_LEGEND_TEXTS } from "./diffVocabulary";
import { createButton, createElement } from "./dom";

/** The chevrons of the legend's Previous and Next buttons, on its icons' 24 × 24 grid. */
export const DIFF_LEGEND_CHEVRONS = {
    previous: "m15 18-6-6 6-6",
    next: "m9 18 6-6-6-6",
} as const;

/** One SVG shape of a legend icon: its tag and its attributes on the 24 × 24 grid. */
export type DiffLegendIconShape = readonly [
    tag: "path" | "circle",
    attributes: Readonly<Record<string, string>>,
];

/** An icon-only button in the legend's look; the caller names it. */
export function diffLegendIconButton(
    modifier: string,
    shapes: readonly DiffLegendIconShape[],
    onClick: () => void,
): HTMLButtonElement {
    const svgNamespace = "http://www.w3.org/2000/svg";
    const icon = document.createElementNS(svgNamespace, "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("aria-hidden", "true");
    icon.classList.add("diff-legend__icon");
    for (const [tag, attributes] of shapes) {
        const shape = document.createElementNS(svgNamespace, tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value);
        icon.append(shape);
    }
    const button = createButton(`diff-legend__nav-btn ${modifier}`, onClick);
    button.append(icon);
    return button;
}

/**
 * Keeps `--diff-legend-height` on `target` at `legend`'s height once it
 * shows, so the views below start under it even when its counts wrap.
 * Returns the observer to disconnect, or none where the browser lacks one.
 */
export function reserveLegendHeight(
    legend: HTMLElement,
    target: HTMLElement,
): ResizeObserver | undefined {
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => {
        const height = legend.offsetHeight;
        if (height > 0) target.style.setProperty("--diff-legend-height", `${height}px`);
    });
    observer.observe(legend);
    return observer;
}

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

/** One count slot: what it counts, the i18n key of its label and its swatch's class modifier. */
export interface DiffLegendSlot<Key extends string = DiffCategory> {
    readonly key: Key;
    readonly label: string;
    readonly modifier: string;
}

/** What one diff legend shows. */
export interface DiffLegendState<Key extends string = DiffCategory> {
    /** One count per slot; omitted when `status` names the open view's single change. */
    readonly counts?: Readonly<Record<Key, number>>;
    readonly status?: Key;
    /** Shown above the counts on compare-files panes, where the tab names both files. */
    readonly filename?: string;
    readonly showSwap: boolean;
    readonly canStep: boolean;
    /** `false` leaves the changes to a partner pane's bar, as the right half of a bar split across two panes. */
    readonly showChanges?: boolean;
    /** `false` leaves stepping, Show all and swap to a partner pane's bar, as the left half of a split bar. */
    readonly showControls?: boolean;
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

// The diff's own slots are the default, so the published legend and the DMN legend need no list.
const DIFF_SLOTS: readonly DiffLegendSlot[] = DIFF_CATEGORIES.map((category) => ({
    key: category,
    label: DIFF_CATEGORY_LABELS[category],
    modifier: SLOT_MODIFIERS[category],
}));

/** A legend with its own slots must name them; only the diff's categories have a default. */
type SlotsArgument<Key extends string> = [Key] extends [DiffCategory]
    ? [slots?: readonly DiffLegendSlot<Key>[]]
    : [slots: readonly DiffLegendSlot<Key>[]];

interface CountSlot<Key extends string> {
    readonly definition: DiffLegendSlot<Key>;
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
 *
 * A caller may count its own slots instead of the diff categories and add its
 * own controls below the counts through {@link extensionElement}.
 */
export class DiffLegendView<Key extends string = DiffCategory> {
    readonly element = createElement("div", "diff-legend");

    private readonly filename = createElement("div", "diff-legend__filename");
    private readonly countsRow = createElement("div", "diff-legend__counts");
    // Created on the first status, so a legend that only ever counts keeps its published DOM.
    private status?: StatusSlot;
    private readonly slots: readonly DiffLegendSlot<Key>[];
    private readonly countSlots: readonly CountSlot<Key>[];
    // Created on first use, like the status chip, for the same reason.
    private extension?: HTMLElement;
    private readonly none = createElement("span", "diff-legend__none");
    private readonly previousButton: HTMLButtonElement;
    private readonly nextButton: HTMLButtonElement;
    private readonly position = createElement("span", "diff-legend__position");
    private readonly showAllButton: HTMLButtonElement;
    private readonly nav = createElement("div", "diff-legend__nav");
    private readonly swapGroup = createElement("div", "diff-legend__swap-group");
    // Shares the nav buttons' class so both groups align and theme alike.
    private readonly swapButton: HTMLButtonElement;
    private readonly stopTranslating: () => void;
    private state?: DiffLegendState<Key>;
    private sizeObserver?: ResizeObserver;

    constructor(
        parent: HTMLElement,
        private readonly actions: DiffLegendActions,
        private readonly translator: DiffLegendTranslator,
        ...[slots]: SlotsArgument<Key>
    ) {
        this.slots =
            slots ?? (DIFF_SLOTS as readonly DiffLegendSlot<string>[] as typeof this.slots);
        this.countSlots = this.slots.map((definition) => DiffLegendView.countSlot(definition));
        this.previousButton = diffLegendIconButton(
            "diff-legend__prev-btn",
            [["path", { d: DIFF_LEGEND_CHEVRONS.previous }]],
            actions.onPrevious,
        );
        this.nextButton = diffLegendIconButton(
            "diff-legend__next-btn",
            [["path", { d: DIFF_LEGEND_CHEVRONS.next }]],
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

    /** The element below the counts a caller fills with its own controls. */
    extensionElement(): HTMLElement {
        if (!this.extension) {
            this.extension = createElement("div", "diff-legend__extension");
            this.element.append(this.extension);
        }
        return this.extension;
    }

    update(state: DiffLegendState<Key>): void {
        this.state = state;
        this.element.hidden = false;
        this.countsRow.hidden = state.showChanges === false;
        this.nav.hidden = state.showControls === false;
        this.enableStepping(state.canStep);
        this.swapGroup.hidden = !(state.showSwap && this.actions.onSwap) || this.nav.hidden;
        this.filename.hidden = !state.filename;
        this.filename.textContent = state.filename ?? "";
        this.showStatus(state.status);
        this.showCounts(state.counts);
        this.showPosition(state.position);
        this.renderWords();
    }

    /** Keeps `--diff-legend-height` on `target` at the bar's height ({@link reserveLegendHeight}). */
    reserveRoomOn(target: HTMLElement): void {
        this.sizeObserver?.disconnect();
        this.sizeObserver = reserveLegendHeight(this.element, target);
    }

    destroy(): void {
        this.stopTranslating();
        this.sizeObserver?.disconnect();
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
        this.nav.append(this.previousButton, this.nextButton, this.position, this.showAllButton);
        this.countsRow.append(...this.countSlots.map(({ slot }) => slot), this.none);
        this.element.append(this.filename, this.countsRow, this.nav, this.swapGroup);
    }

    private enableStepping(canStep: boolean): void {
        for (const button of [this.previousButton, this.nextButton, this.showAllButton]) {
            button.disabled = !canStep;
        }
    }

    private showStatus(status: Key | undefined): void {
        if (status) {
            this.status ??= this.prependStatusSlot();
            this.status.swatch.className = DiffLegendView.swatchClass(this.slotOf(status).modifier);
        }
        if (this.status) {
            this.status.slot.hidden = !status;
        }
    }

    private showCounts(counts: Readonly<Record<Key, number>> | undefined): void {
        for (const { definition, slot, count } of this.countSlots) {
            const changes = counts?.[definition.key] ?? 0;
            slot.hidden = changes === 0;
            count.textContent = String(changes);
        }
        this.none.hidden = !counts || this.slots.some(({ key }) => counts[key] > 0);
    }

    private slotOf(key: Key): DiffLegendSlot<Key> {
        return this.slots.find((slot) => slot.key === key) as DiffLegendSlot<Key>;
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
        for (const { definition, slot, label } of this.countSlots) {
            slot.title = translate(definition.label);
            label.data = `${slot.title} `;
        }
        const status = this.state?.status;
        if (this.status) {
            this.status.label.data = status ? translate(this.slotOf(status).label) : "";
        }
        this.none.textContent = translate(DIFF_LEGEND_TEXTS.none);
        this.showAllButton.textContent = translate(DIFF_LEGEND_TEXTS.showAll);
        DiffLegendView.nameIconButton(this.previousButton, translate(DIFF_LEGEND_TEXTS.previous));
        DiffLegendView.nameIconButton(this.nextButton, translate(DIFF_LEGEND_TEXTS.next));
        DiffLegendView.nameIconButton(this.swapButton, translate(DIFF_LEGEND_TEXTS.swap));
    }

    /** An icon-only button's name, for its tooltip and for screen readers. */
    private static nameIconButton(button: HTMLButtonElement, label: string): void {
        button.title = label;
        button.setAttribute("aria-label", label);
    }

    private static countSlot<Key extends string>(definition: DiffLegendSlot<Key>): CountSlot<Key> {
        const slot = createElement(
            "div",
            `diff-legend__slot diff-legend__slot--${definition.modifier}`,
        );
        const text = createElement("span", "diff-legend__label");
        const label = document.createTextNode("");
        const count = createElement("b", "diff-legend__count");
        text.append(label, count);
        slot.append(createElement("span", DiffLegendView.swatchClass(definition.modifier)), text);
        return { definition, slot, label, count };
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

    private static swatchClass(modifier: string): string {
        return `diff-legend__swatch diff-legend__swatch--${modifier}`;
    }
}
