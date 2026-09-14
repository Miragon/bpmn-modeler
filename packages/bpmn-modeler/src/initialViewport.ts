import {
    type Disposer,
    observeCanvasSize,
    type ResizableCanvas,
} from "@miragon/bpmn-modeler-types";

/**
 * The one initial-viewport decision policy (#1490), shared by `ViewportManager`
 * and the diff panes.
 *
 * A fresh diagram's first viewport is decided exactly once: by an explicit
 * viewport applied through {@link markDecided}, or by the first successful fit.
 * Later resize-observer deliveries must not fit over that decision, or a
 * consumer's post-load `applyViewState` / saved-state restore is stomped. A
 * usable viewport handed in before the canvas has a box is {@link hold}d until a
 * delivery finds it sized.
 */
export class InitialViewportLatch<V> {
    private decided = false;

    private pending: V | undefined;

    constructor(
        private readonly ports: {
            applyViewport(viewport: V): boolean;
            fitViewport(): boolean;
        },
    ) {}

    get isDecided(): boolean {
        return this.decided;
    }

    /** Re-arms the decision for a fresh diagram. */
    reset(): void {
        this.decided = false;
        this.pending = undefined;
    }

    markDecided(): void {
        this.decided = true;
        this.pending = undefined;
    }

    /** Stashes a viewport handed in while the canvas was unsized. */
    hold(viewport: V): void {
        this.pending = viewport;
    }

    /**
     * The resize-observer callback: applies a held viewport, else fits. Returns
     * `true` once the viewport is decided so the observer stops retrying.
     */
    applyOnce(): boolean {
        if (this.decided) {
            return true;
        }
        const applied =
            this.pending !== undefined
                ? this.ports.applyViewport(this.pending)
                : this.ports.fitViewport();
        if (applied) {
            this.markDecided();
        }
        return applied;
    }
}

/**
 * Arms the initial-viewport policy for a freshly loaded diagram: re-arms the
 * surface's latch, retries the initial fit on every resize until the box is
 * trustworthy, and runs one unlatched best-effort fit now. The returned disposer
 * stops observing — hold it in a {@link MutableDisposable} so the next load's
 * arm disposes it.
 */
export function armInitialViewportPolicy(
    canvas: ResizableCanvas & { getContainer(): Element },
    surface: {
        resetInitialViewportDecision(): void;
        applyInitialViewportOnce(): boolean;
        fitViewport(): boolean;
    },
): Disposer {
    // The host may mount the container before laying it out, so the box can be
    // zero when the import lands; the fit retries until it isn't.
    surface.resetInitialViewportDecision();
    const stop = observeCanvasSize(canvas, canvas.getContainer(), {
        applyInitialViewport: () => surface.applyInitialViewportOnce(),
    });
    // Unlatched best-effort fit: it must not decide the viewport, or a consumer's
    // post-load applyViewState / saved-state restore is skipped.
    surface.fitViewport();
    return stop;
}
