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
     * false once every outstanding call has settled or been cancelled. Two
     * sources because firing snapshots the scheduled resolvers out of
     * `resolveSet` into the running generation: `resolveSet.size` covers callers
     * still waiting on the timer, and `inFlight` covers the invocation currently
     * running. Together they span the whole scheduled→running→done arc, not just
     * the lodash timer. Used by the flush protocol to decide whether the webview
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
    // Reassigned on every fire: the running generation drains its own snapshot
    // while callers arriving mid-run accumulate into the fresh live sets.
    let resolveSet = new Set<(p: unknown) => void>();
    let rejectSet = new Set<(p: unknown) => void>();

    // The promise of the most recent fired invocation, so `flush` can await
    // work already running — not just trip a pending timer.
    let inFlight: Promise<unknown> | undefined;

    const debounced = debounce((args: Parameters<F>) => {
        // Snapshot this generation's resolvers and hand the wrapper fresh sets
        // *before* running `func`. A call landing during the async run must
        // settle with the *next* result, not this one; sharing the sets let an
        // older settle drain a newer scheduled call's resolvers — flipping
        // `pending()` false while its timer was still armed and resolving it
        // early with the stale value.
        const runResolves = resolveSet;
        const runRejects = rejectSet;
        resolveSet = new Set<(p: unknown) => void>();
        rejectSet = new Set<(p: unknown) => void>();

        const run = func(...args);
        inFlight = run;
        const clearInFlight = (): void => {
            // Guard against a newer invocation having replaced us: clearing
            // unconditionally would strand the newer `inFlight` if an older
            // call settled last. Cleared here (not in a trailing `.finally`) so
            // `pending()` — which reads `inFlight` — flips false the moment this
            // generation settles, not a microtask later.
            if (inFlight === run) {
                inFlight = undefined;
            }
        };
        run.then((...res) => {
            clearInFlight();
            runResolves.forEach((resolve) => resolve(...res));
        }).catch((...res) => {
            clearInFlight();
            runRejects.forEach((reject) => reject(...res));
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
        // Only the current (not-yet-fired) generation is drained here — an
        // in-flight run owns its own snapshot and settles it independently.
        resolveSet.forEach((resolve) => resolve(undefined));
        resolveSet = new Set<(p: unknown) => void>();
        rejectSet = new Set<(p: unknown) => void>();
    };

    wrapper.pending = (): boolean => resolveSet.size > 0 || inFlight !== undefined;

    return wrapper as AsyncDebounced<F>;
}
