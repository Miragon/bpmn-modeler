import { DiffCounts } from "@miragon/bpmn-modeler-diff";
import { i18n } from "@miragon/bpmn-modeler-i18n";
import { DIFF_CATEGORIES, DiffLegendView } from "@miragon/bpmn-modeler-types";

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
    private readonly view: DiffLegendView;

    constructor(parent: HTMLElement, callbacks: DiffLegendCallbacks) {
        this.view = new DiffLegendView(parent, callbacks, i18n);
    }

    update(context: DiffLegendContext): void {
        const { counts, filename, showSwap, canStep } = context;
        this.view.update({
            counts,
            filename,
            showSwap: showSwap ?? false,
            canStep: canStep ?? DIFF_CATEGORIES.some((category) => counts[category] > 0),
        });
    }

    destroy(): void {
        this.view.destroy();
    }
}
