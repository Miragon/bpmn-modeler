import { DiffCounts } from "@bpmn-modeler/shared";

export interface DiffLegendCallbacks {
    onPrevious: () => void;
    onNext: () => void;
}

/**
 * Floating legend chip anchored to the top of the canvas.
 *
 * Shows per-category counts with matching colour swatches plus prev/next
 * navigation buttons that step through the diff's changed elements.  Stays
 * hidden until {@link update} is called so the canvas isn't cluttered while
 * the diagram is still importing.
 */
export class DiffLegend {
    private readonly root: HTMLElement;

    private readonly addedCount: HTMLElement;

    private readonly removedCount: HTMLElement;

    private readonly changedCount: HTMLElement;

    private readonly layoutCount: HTMLElement;

    private readonly prevButton: HTMLButtonElement;

    private readonly nextButton: HTMLButtonElement;

    constructor(parent: HTMLElement, callbacks: DiffLegendCallbacks) {
        this.root = document.createElement("div");
        this.root.className = "diff-legend";
        this.root.style.display = "none";

        this.addedCount = this.makeCountSlot("added", "Added");
        this.removedCount = this.makeCountSlot("removed", "Removed");
        this.changedCount = this.makeCountSlot("changed", "Changed");
        this.layoutCount = this.makeCountSlot("layout", "Moved");

        this.prevButton = this.makeNavButton("‹ Prev change", callbacks.onPrevious);
        this.nextButton = this.makeNavButton("Next change ›", callbacks.onNext);

        const nav = document.createElement("div");
        nav.className = "diff-legend__nav";
        nav.append(this.prevButton, this.nextButton);
        this.root.append(nav);

        parent.append(this.root);
    }

    /**
     * Reveals the legend and renders the given counts.  Disables the nav
     * buttons when there are no changes at all.
     */
    update(counts: DiffCounts): void {
        this.setCount(this.addedCount, counts.added);
        this.setCount(this.removedCount, counts.removed);
        this.setCount(this.changedCount, counts.changed);
        this.setCount(this.layoutCount, counts.layoutChanged);

        const total =
            counts.added + counts.removed + counts.changed + counts.layoutChanged;
        const hasChanges = total > 0;
        this.prevButton.disabled = !hasChanges;
        this.nextButton.disabled = !hasChanges;

        this.root.style.display = "flex";
    }

    // ─── Private helpers ─────────────────────────────────────────────────────

    private makeCountSlot(kind: string, label: string): HTMLElement {
        const slot = document.createElement("div");
        slot.className = `diff-legend__slot diff-legend__slot--${kind}`;

        const swatch = document.createElement("span");
        swatch.className = `diff-legend__swatch diff-legend__swatch--${kind}`;
        slot.append(swatch);

        const text = document.createElement("span");
        text.className = "diff-legend__label";
        text.textContent = `${label}: 0`;
        text.dataset.label = label;
        slot.append(text);

        this.root.append(slot);
        return text;
    }

    private setCount(slot: HTMLElement, count: number): void {
        slot.textContent = `${slot.dataset.label}: ${count}`;
    }

    private makeNavButton(label: string, onClick: () => void): HTMLButtonElement {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "diff-legend__nav-btn";
        btn.textContent = label;
        btn.addEventListener("click", onClick);
        return btn;
    }
}
