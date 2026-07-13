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
}

/**
 * Makes the [lodash.debounce](https://lodash.com/docs/4.17.15#debounce) function async-friendly
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 */
export function asyncDebounce<F extends (...args: any[]) => Promise<unknown>>(
    func: F,
    wait?: number,
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
    }, wait);

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

    return wrapper as AsyncDebounced<F>;
}
