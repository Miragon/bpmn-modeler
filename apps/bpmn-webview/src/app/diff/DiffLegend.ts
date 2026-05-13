import { DiffCounts, DiffOrigin } from "@miragon/bpmn-modeler-shared";
import { i18n } from "@miragon/bpmn-modeler-i18n";

export interface DiffLegendCallbacks {
    onPrevious: () => void;
    onNext: () => void;
    /**
     * Invoked when the user clicks the swap button.  Only wired up for
     * compare-files panes — SCM panes never render the button.
     */
    onSwap: () => void;
}

/** Dictionary key rendered as a count slot's label. */
type SlotKey = "Added" | "Removed" | "Changed" | "Moved";

/** Per-update info the legend needs about its host session. */
export interface DiffLegendContext {
    readonly counts: DiffCounts;
    /**
     * Origin of the diff session.  Drives origin-specific affordances: the
     * filename label and the swap button only appear for `compare-files`.
     */
    readonly origin: DiffOrigin;
    /**
     * Basename of this pane's document, rendered as a subtitle above the
     * counts row.  Shown only when {@link origin} is `compare-files`.
     */
    readonly filename: string;
}

/**
 * Floating legend chip anchored to the top of the canvas.
 *
 * Shows per-category counts with matching colour swatches plus prev/next
 * navigation buttons that step through the diff's changed elements.  Stays
 * hidden until {@link update} is called so the canvas isn't cluttered while
 * the diagram is still importing.
 *
 * Compare-files panes additionally render the pane's filename as a subtitle
 * and a swap button that reverses the left/right sides.  SCM panes render
 * neither — VS Code's tab title already carries the filename/ref metadata,
 * and swapping refs isn't an operation the extension owns.
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

    /** Latest context passed to {@link update}, kept so {@link renderLabels} can redraw on language change. */
    private context: DiffLegendContext = {
        counts: { added: 0, removed: 0, changed: 0, layoutChanged: 0 },
        origin: "scm",
        filename: "",
    };

    constructor(parent: HTMLElement, callbacks: DiffLegendCallbacks) {
        this.root = document.createElement("div");
        this.root.className = "diff-legend";
        this.root.style.display = "none";

        // Filename subtitle — rendered above the counts row.  Stays hidden for
        // SCM panes; an empty textContent would still occupy layout, so
        // toggling `display` is cleaner than only blanking the text.
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
        i18n.onChange(() => this.renderLabels());
    }

    /**
     * Reveals the legend and renders the given context.  Disables the nav
     * buttons when there are no changes at all; shows the filename subtitle
     * and swap button only for compare-files panes.
     */
    update(context: DiffLegendContext): void {
        this.context = context;
        this.renderLabels();

        const { counts, origin } = context;
        const total = counts.added + counts.removed + counts.changed + counts.layoutChanged;
        const hasChanges = total > 0;
        this.prevButton.disabled = !hasChanges;
        this.nextButton.disabled = !hasChanges;

        const showOriginAffordances = origin === "compare-files";
        this.filenameEl.style.display = showOriginAffordances ? "block" : "none";
        this.swapButton.style.display = showOriginAffordances ? "inline-flex" : "none";

        this.root.style.display = "flex";
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

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

    private makeSwapButton(onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type = "button";
        // Reuses the same visual class as the nav buttons so both button
        // groups align and theme consistently, and adds a marker class for
        // the swap-only spacing rule in diff.css.
        btn.className = "diff-legend__nav-btn diff-legend__swap-btn";
        btn.style.display = "none";
        btn.addEventListener("click", onClick);
        return btn;
    }

    /**
     * Redraws every translated label from the current {@link context} and
     * {@link i18n} locale.  Called on init, on {@link update}, and whenever
     * {@link i18n} notifies of a language switch.
     */
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
        this.filenameEl.textContent = filename;
    }
}
