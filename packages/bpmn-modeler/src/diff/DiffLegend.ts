import { DiffCounts } from "@miragon/bpmn-modeler-diff";
import { i18n } from "@miragon/bpmn-modeler-i18n";

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

type SlotKey = "Added" | "Removed" | "Changed" | "Moved";

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

    private readonly slots: readonly { key: SlotKey; el: HTMLElement }[];

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

        this.slots = [
            { key: "Added", el: this.makeCountSlot(countsRow, "added") },
            { key: "Removed", el: this.makeCountSlot(countsRow, "removed") },
            { key: "Changed", el: this.makeCountSlot(countsRow, "changed") },
            { key: "Moved", el: this.makeCountSlot(countsRow, "layout") },
        ];

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
        const total = counts.added + counts.removed + counts.changed + counts.layoutChanged;
        const hasChanges = total > 0;
        this.prevButton.disabled = !hasChanges;
        this.nextButton.disabled = !hasChanges;

        this.filenameEl.style.display = filename ? "block" : "none";
        this.swapButton.style.display = this.hasSwap && showSwap ? "inline-flex" : "none";

        this.root.style.display = "flex";
    }

    private makeCountSlot(parent: HTMLElement, kind: string): HTMLElement {
        const slot = document.createElement("div");
        slot.className = `diff-legend__slot diff-legend__slot--${kind}`;

        const swatch = document.createElement("span");
        swatch.className = `diff-legend__swatch diff-legend__swatch--${kind}`;
        slot.append(swatch);

        const text = document.createElement("span");
        text.className = "diff-legend__label";
        slot.append(text);

        parent.append(slot);
        return text;
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
        // Reuses the same visual class as the nav buttons so both button
        // groups align and theme consistently, and adds a marker class for
        // the swap-only spacing rule in diff.css.
        btn.className = "diff-legend__nav-btn diff-legend__swap-btn";
        btn.style.display = "none";
        if (onClick) {
            btn.addEventListener("click", onClick);
        }
        return btn;
    }

    private renderLabels(): void {
        const { counts, filename } = this.context;
        const countFor: Record<SlotKey, number> = {
            Added: counts.added,
            Removed: counts.removed,
            Changed: counts.changed,
            Moved: counts.layoutChanged,
        };
        for (const { key, el } of this.slots) {
            el.textContent = `${i18n.translate(key)}: ${countFor[key]}`;
        }
        this.prevButton.textContent = `‹ ${i18n.translate("Prev change")}`;
        this.nextButton.textContent = `${i18n.translate("Next change")} ›`;
        this.swapButton.textContent = `⇄ ${i18n.translate("Swap sides")}`;
        this.filenameEl.textContent = filename ?? "";
    }

    destroy(): void {
        this.disposeI18n();
        this.root.remove();
    }
}
