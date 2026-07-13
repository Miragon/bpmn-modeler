import { debounce } from "lodash";

/**
 * An async-friendly debounced function with imperative flush/cancel controls.
 *
 * The controls exist for teardown paths that cannot afford to wait out the
 * timer: a tab closing must force the last keystroke into the model *now*
 * (`flush`), and a canvas-undo must drop a stale pending keystroke so it can't
 * fire after and clobber the undo (`cancel`). lodash's own `flush` only trips
 * the timer — it can't await our async `func` — so we track the in-flight
 * promise ourselves.
 */
export interface AsyncDebounced<F extends (...args: any[]) => Promise<unknown>> {
    (...args: Parameters<F>): ReturnType<F>;
    /** Fires a pending invocation now; resolves after it (or an in-flight one) settles. No-op when idle. */
    flush(): Promise<void>;
    /** Drops a pending invocation; outstanding caller promises resolve with `undefined`. */
    cancel(): void;
    /**
     * True while a trailing call is scheduled *or* an invocation is in flight;
     * false once every outstanding call has settled or been cancelled. Backed by
     * `resolveSet.size`, whose entries live from a wrapper call until its promise
     * settles — so it covers the whole scheduled→running→done arc, not just the
     * lodash timer. Used by the flush protocol to decide whether the webview
     * holds unsynced changes worth exporting.
     */
    pending(): boolean;
}

/**
 * Makes the [lodash.debounce](https://lodash.com/docs/4.17.15#debounce) function async-friendly
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @param options Forwarded to lodash `debounce` — notably `maxWait`, the upper
 *   bound on how long a sustained call stream can starve the trailing edge.
 */
export function asyncDebounce<F extends (...args: any[]) => Promise<unknown>>(
    func: F,
    wait?: number,
    options?: { maxWait?: number },
): AsyncDebounced<F> {
    const resolveSet = new Set<(p: unknown) => void>();
    const rejectSet = new Set<(p: unknown) => void>();

    // The promise of the most recent fired invocation, so `flush` can await
    // work already running — not just trip a pending timer.
    let inFlight: Promise<unknown> | undefined;

    const debounced = debounce((args: Parameters<F>) => {
        const run = func(...args);
        inFlight = run;
        run.then((...res) => {
            resolveSet.forEach((resolve) => resolve(...res));
            resolveSet.clear();
        })
            .catch((...res) => {
                rejectSet.forEach((reject) => reject(...res));
                rejectSet.clear();
            })
            .finally(() => {
                // Guard against a newer invocation having replaced us: clearing
                // unconditionally would strand the newer `inFlight` if an older
                // call settled last.
                if (inFlight === run) {
                    inFlight = undefined;
                }
            });
    }, wait, options);

    const wrapper = (...args: Parameters<F>): ReturnType<F> =>
        new Promise((resolve, reject) => {
            resolveSet.add(resolve);
            rejectSet.add(reject);
            debounced(args);
        }) as ReturnType<F>;

    wrapper.flush = async (): Promise<void> => {
        // `debounced.flush()` runs the pending trailing call synchronously
        // (setting `inFlight`); awaiting it lets callers sequence teardown
        // after the model has actually been updated.
        debounced.flush();
        await inFlight;
    };

    wrapper.cancel = (): void => {
        debounced.cancel();
        // A dropped invocation still has callers awaiting its promise; settle
        // them with `undefined` rather than leaking pending promises forever.
        resolveSet.forEach((resolve) => resolve(undefined));
        resolveSet.clear();
        rejectSet.clear();
    };

    wrapper.pending = (): boolean => resolveSet.size > 0;

    return wrapper as AsyncDebounced<F>;
}
