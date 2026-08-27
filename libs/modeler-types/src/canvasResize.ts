/**
 * @internal `observeCanvasSize` and its helpers are package-internal wiring the
 * facade installs per instance; the exported names are not part of the designed
 * public API (#1375).
 */

/**
 * Smallest canvas box (px, both axes) worth fitting a diagram into. A host
 * that renders off-screen reports roughly one pixel rather than none, and a
 * fit against that succeeds arithmetically but scales the diagram to nothing.
 */
export const MIN_CANVAS_SIZE_PX = 40;

/**
 * Whether a viewbox can be applied without collapsing the diagram.
 *
 * Catches `NaN` from a box measured against an unlaid-out container, and the
 * `null` it turns into once persisted state has round-tripped through JSON.
 */
export function isUsableViewbox(
    viewbox: { x: number; y: number; width: number; height: number } | undefined,
): boolean {
    if (!viewbox) {
        return false;
    }
    const { x, y, width, height } = viewbox;
    return (
        Number.isFinite(x) &&
        Number.isFinite(y) &&
        Number.isFinite(width) &&
        width > 0 &&
        Number.isFinite(height) &&
        height > 0
    );
}

/** The slice of diagram-js's `Canvas` this module needs. */
export interface ResizableCanvas {
    resized(): void;
}

/** Minimal `ResizeObserver` shape, so a fake can be injected in tests. */
export interface SizeObserver {
    observe(target: Element): void;
    disconnect(): void;
}

export interface CanvasResizeOptions {
    /** Observer factory; injectable because jsdom ships no `ResizeObserver`. */
    createObserver?: (onResize: () => void) => SizeObserver;

    /**
     * Applies the initial viewport. Retried after every resize until it
     * returns `true`, so the canvas alone decides when its box is trustworthy.
     */
    applyInitialViewport?: () => boolean;
}

/**
 * Keeps diagram-js's cached viewbox in sync with the container's real size.
 *
 * bpmn-js calls `canvas.resized()` only from `attachTo()`, which this codebase
 * never uses — modelers are constructed with a `container` option — and
 * nothing else observes the container. The viewbox would otherwise stay cached
 * at whatever size the container had at import time, which on hosts that mount
 * the webview before laying it out is zero.
 *
 * @returns A disposer that stops observing.
 */
export function observeCanvasSize(
    canvas: ResizableCanvas,
    container: Element,
    options: CanvasResizeOptions = {},
): () => void {
    const createObserver = options.createObserver ?? defaultObserverFactory();
    if (!createObserver) {
        return () => undefined;
    }

    let applied = options.applyInitialViewport === undefined;
    const observer = createObserver(() => {
        // `resized()` only drops the cache, so it has to run first or the
        // viewport below still measures the stale box.
        canvas.resized();
        if (!applied) {
            applied = options.applyInitialViewport!();
        }
    });

    observer.observe(container);
    return () => observer.disconnect();
}

/** `undefined` where `ResizeObserver` is missing, so the caller no-ops. */
function defaultObserverFactory(): ((onResize: () => void) => SizeObserver) | undefined {
    const Observer = globalThis.ResizeObserver;
    return Observer ? (onResize) => new Observer(onResize) : undefined;
}
