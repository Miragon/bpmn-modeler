import { DiffCounts } from "@bpmn-modeler/shared";
import { i18n } from "@bpmn-modeler/bpmn-i18n";

export interface DiffLegendCallbacks {
    onPrevious: () => void;
    onNext: () => void;
}

/** Dictionary key rendered as a count slot's label. */
type SlotKey = "Added" | "Removed" | "Changed" | "Moved";

/**
 * Floating legend chip anchored to the top of the canvas.
 *
 * Shows per-category counts with matching colour swatches plus prev/next
 * navigation buttons that step through the diff's changed elements.  Stays
 * hidden until {@link update} is called so the canvas isn't cluttered while
 * the diagram is still importing.
 *
 * Labels are sourced from the shared {@link i18n} translator and re-rendered
 * automatically when the active language changes.
 */
export class DiffLegend {
    private readonly root: HTMLElement;

    private readonly slots: readonly { key: SlotKey; el: HTMLElement }[];

    private readonly prevButton: HTMLButtonElement;

    private readonly nextButton: HTMLButtonElement;

    /** Latest counts passed to {@link update}, kept so {@link renderLabels} can redraw on language change. */
    private counts: DiffCounts = { added: 0, removed: 0, changed: 0, layoutChanged: 0 };

    constructor(parent: HTMLElement, callbacks: DiffLegendCallbacks) {
        this.root = document.createElement("div");
        this.root.className = "diff-legend";
        this.root.style.display = "none";

        this.slots = [
            { key: "Added", el: this.makeCountSlot("added") },
            { key: "Removed", el: this.makeCountSlot("removed") },
            { key: "Changed", el: this.makeCountSlot("changed") },
            { key: "Moved", el: this.makeCountSlot("layout") },
        ];

        this.prevButton = this.makeNavButton(callbacks.onPrevious);
        this.nextButton = this.makeNavButton(callbacks.onNext);

        const nav = document.createElement("div");
        nav.className = "diff-legend__nav";
        nav.append(this.prevButton, this.nextButton);
        this.root.append(nav);

        parent.append(this.root);

        this.renderLabels();
        i18n.onChange(() => this.renderLabels());
    }

    /**
     * Reveals the legend and renders the given counts.  Disables the nav
     * buttons when there are no changes at all.
     */
    update(counts: DiffCounts): void {
        this.counts = counts;
        this.renderLabels();

        const total =
            counts.added + counts.removed + counts.changed + counts.layoutChanged;
        const hasChanges = total > 0;
        this.prevButton.disabled = !hasChanges;
        this.nextButton.disabled = !hasChanges;

        this.root.style.display = "flex";
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private makeCountSlot(kind: string): HTMLElement {
        const slot = document.createElement("div");
        slot.className = `diff-legend__slot diff-legend__slot--${kind}`;

        const swatch = document.createElement("span");
        swatch.className = `diff-legend__swatch diff-legend__swatch--${kind}`;
        slot.append(swatch);

        const text = document.createElement("span");
        text.className = "diff-legend__label";
        slot.append(text);

        this.root.append(slot);
        return text;
    }

    private makeNavButton(onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "diff-legend__nav-btn";
        btn.addEventListener("click", onClick);
        return btn;
    }

    /**
     * Redraws every translated label from the current {@link counts} and
     * {@link i18n} locale.  Called on init, on {@link update}, and whenever
     * {@link i18n} notifies of a language switch.
     */
    private renderLabels(): void {
        const countFor: Record<SlotKey, number> = {
            Added: this.counts.added,
            Removed: this.counts.removed,
            Changed: this.counts.changed,
            Moved: this.counts.layoutChanged,
        };
        for (const { key, el } of this.slots) {
            el.textContent = `${i18n.translate(key)}: ${countFor[key]}`;
        }
        this.prevButton.textContent = `‹ ${i18n.translate("Prev change")}`;
        this.nextButton.textContent = `${i18n.translate("Next change")} ›`;
    }
}
