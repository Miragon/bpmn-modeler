import { DiffCounts } from "@miragon/bpmn-modeler-diff";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import {
    DIFF_CATEGORIES,
    DIFF_CATEGORY_LABELS,
    DIFF_LEGEND_TEXTS,
    type DiffCategory,
} from "@miragon/bpmn-modeler-types";

export interface DiffLegendCallbacks {
    onPrevious: () => void;
    onNext: () => void;
    /**
     * Invoked when the user clicks the swap button.  Omit it to drop the
     * button entirely — a pane that cannot swap sides (e.g. an SCM diff) never
     * renders it.  Presentation policy (which origins offer swapping) lives in
     * the consumer, not this primitive.
     */
    onSwap?: () => void;
}

// Public styling hooks: consumers select the swatches by these modifiers.
const SLOT_MODIFIERS: Readonly<Record<DiffCategory, string>> = {
    added: "added",
    removed: "removed",
    changed: "changed",
    layoutChanged: "layout",
};

interface CountSlot {
    readonly category: DiffCategory;
    readonly label: Text;
    readonly count: HTMLElement;
}

/**
 * Per-update info the legend renders.  Presentation-only: the consumer decides
 * whether a filename subtitle and swap button apply (previously derived from a
 * VS Code `DiffOrigin`; that mapping now lives app-side).
 */
export interface DiffLegendContext {
    readonly counts: DiffCounts;
    /**
     * Basename to render as a subtitle above the counts row.  Omit it to hide
     * the subtitle.
     */
    readonly filename?: string;
    /**
     * Whether to show the swap button.  Only honoured when an `onSwap`
     * callback was supplied at construction; defaults to hidden.
     */
    readonly showSwap?: boolean;
    /**
     * Whether Previous and Next have a change to step to, e.g. a
     * `DiffNavigator`'s or `DiffPaneCoordinator`'s `canStep`.
     * Counts alone can overstate it: they include connections that only moved,
     * which the stepper skips. Without it, the legend can only guess from the
     * counts and enables the buttons whenever any count is above zero.
     */
    readonly canStep?: boolean;
}

/**
 * Floating legend chip anchored to the top of the canvas.
 *
 * Shows per-category counts with matching colour swatches plus prev/next
 * navigation buttons that step through the diff's changed elements.  Stays
 * hidden until {@link update} is called so the canvas isn't cluttered while
 * the diagram is still importing.
 *
 * A pane may additionally render a filename subtitle and a swap button — both
 * are presentation policy the consumer opts into (via {@link DiffLegendContext}
 * and the optional `onSwap` callback), not something this primitive infers.
 *
 * Labels are sourced from the shared {@link i18n} translator and re-rendered
 * automatically when the active language changes.
 */
export class DiffLegend {
    private readonly root: HTMLElement;

    private readonly filenameEl: HTMLElement;

    private readonly slots: readonly CountSlot[];

    private readonly prevButton: HTMLButtonElement;

    private readonly nextButton: HTMLButtonElement;

    private readonly swapButton: HTMLButtonElement;

    /** Whether an `onSwap` callback was supplied — gates the swap button. */
    private readonly hasSwap: boolean;

    /** Unsubscribes the {@link i18n} language-change listener on {@link destroy}. */
    private readonly disposeI18n: () => void;

    // Latest context passed to {@link update}, kept so {@link renderLabels} can redraw on language change.
    private context: DiffLegendContext = {
        counts: { added: 0, removed: 0, changed: 0, layoutChanged: 0 },
    };

    constructor(parent: HTMLElement, callbacks: DiffLegendCallbacks) {
        this.hasSwap = callbacks.onSwap !== undefined;

        this.root = document.createElement("div");
        this.root.className = "diff-legend";
        this.root.setAttribute("role", "toolbar");
        this.root.style.display = "none";

        // Filename subtitle — rendered above the counts row.  Hidden until a
        // filename is supplied; an empty textContent would still occupy layout,
        // so toggling `display` is cleaner than only blanking the text.
        this.filenameEl = document.createElement("div");
        this.filenameEl.className = "diff-legend__filename";
        this.filenameEl.style.display = "none";
        this.root.append(this.filenameEl);

        const countsRow = document.createElement("div");
        countsRow.className = "diff-legend__counts";
        this.root.append(countsRow);

        this.slots = DIFF_CATEGORIES.map((category) => this.makeCountSlot(countsRow, category));

        this.prevButton = this.makeNavButton(callbacks.onPrevious);
        this.nextButton = this.makeNavButton(callbacks.onNext);
        this.swapButton = this.makeSwapButton(callbacks.onSwap);

        const nav = document.createElement("div");
        nav.className = "diff-legend__nav";
        nav.append(this.prevButton, this.nextButton);
        countsRow.append(nav);

        const swapGroup = document.createElement("div");
        swapGroup.className = "diff-legend__swap-group";
        swapGroup.append(this.swapButton);
        countsRow.append(swapGroup);

        parent.append(this.root);

        this.renderLabels();
        this.disposeI18n = i18n.onChange(() => this.renderLabels());
    }

    update(context: DiffLegendContext): void {
        this.context = context;
        this.renderLabels();

        const { counts, filename, showSwap } = context;
        const canStep = context.canStep ?? DIFF_CATEGORIES.some((category) => counts[category] > 0);
        this.prevButton.disabled = !canStep;
        this.nextButton.disabled = !canStep;

        this.filenameEl.style.display = filename ? "block" : "none";
        this.swapButton.style.display = this.hasSwap && showSwap ? "inline-flex" : "none";

        this.root.style.display = "flex";
    }

    private makeCountSlot(parent: HTMLElement, category: DiffCategory): CountSlot {
        const modifier = SLOT_MODIFIERS[category];
        const slot = document.createElement("div");
        slot.className = `diff-legend__slot diff-legend__slot--${modifier}`;

        const swatch = document.createElement("span");
        swatch.className = `diff-legend__swatch diff-legend__swatch--${modifier}`;

        const text = document.createElement("span");
        text.className = "diff-legend__label";
        const label = document.createTextNode("");
        const count = document.createElement("b");
        count.className = "diff-legend__count";
        text.append(label, count);

        slot.append(swatch, text);
        parent.append(slot);
        return { category, label, count };
    }

    private makeNavButton(onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "diff-legend__nav-btn";
        btn.addEventListener("click", onClick);
        return btn;
    }

    private makeSwapButton(onClick?: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type = "button";
        // Shares the nav buttons' class so both groups align and theme alike.
        btn.className = "diff-legend__nav-btn diff-legend__swap-btn";
        btn.textContent = "⇄";
        btn.style.display = "none";
        if (onClick) {
            btn.addEventListener("click", onClick);
        }
        return btn;
    }

    private renderLabels(): void {
        const { counts, filename } = this.context;
        this.root.setAttribute("aria-label", i18n.translate(DIFF_LEGEND_TEXTS.changes));
        for (const { category, label, count } of this.slots) {
            label.data = `${i18n.translate(DIFF_CATEGORY_LABELS[category])} `;
            count.textContent = String(counts[category]);
        }
        this.prevButton.textContent = `‹ ${i18n.translate(DIFF_LEGEND_TEXTS.previous)}`;
        this.nextButton.textContent = `${i18n.translate(DIFF_LEGEND_TEXTS.next)} ›`;
        const swapLabel = i18n.translate(DIFF_LEGEND_TEXTS.swap);
        this.swapButton.title = swapLabel;
        this.swapButton.setAttribute("aria-label", swapLabel);
        this.filenameEl.textContent = filename ?? "";
    }

    destroy(): void {
        this.disposeI18n();
        this.root.remove();
    }
}
