/** Backstop (ms) for a host reply that may never arrive. */
export const HOST_REPLY_TIMEOUT_MS = 5000;

/**
 * Create a way to resolve a Promise manually.
 * @returns - {
 *     wait - Returns the Promise to await, optionally bounded by a timeout
 *     done - Resolves the Promise returned by wait
 * }
 */
export function createResolver<T>() {
    let resolver: (r: T | undefined) => void;
    const promise = new Promise<T | undefined>((resolve) => {
        resolver = (response: T | undefined) => {
            resolve(response);
        };
    });

    /**
     * Awaits the manual resolution.
     *
     * With `timeoutMs`, resolves to `undefined` if {@link done} has not been
     * called within that window — so a dropped host reply can no longer stall a
     * bootstrap that awaits this resolver. Every consumer already treats
     * `undefined` as "not answered". Omitting `timeoutMs` waits indefinitely,
     * keeping existing call sites unchanged.
     */
    function wait(timeoutMs?: number): Promise<T | undefined> {
        if (timeoutMs === undefined) {
            return promise;
        }
        return new Promise<T | undefined>((resolve) => {
            const timer = setTimeout(() => resolve(undefined), timeoutMs);
            void promise.then((value) => {
                clearTimeout(timer);
                resolve(value);
            });
        });
    }

    function done(data: T | undefined) {
        resolver(data);
    }

    return { wait, done };
}

/**
 * Pairs id-correlated host replies with their requests.
 *
 * `open` takes the next request id and returns the reply to await; it resolves
 * to `undefined` when no reply arrives within `timeoutMs`. `settle` ignores
 * unknown, already settled and timed-out ids, so a dropped or late reply never
 * leaves an entry behind.
 */
export function createReplyRegistry<T>(timeoutMs = HOST_REPLY_TIMEOUT_MS) {
    const pending = new Map<number, ReturnType<typeof createResolver<T>>>();
    let lastRequestId = 0;

    function open(): { requestId: number; reply: Promise<T | undefined> } {
        const requestId = ++lastRequestId;
        const resolver = createResolver<T>();
        pending.set(requestId, resolver);
        const reply = resolver.wait(timeoutMs).finally(() => pending.delete(requestId));
        return { requestId, reply };
    }

    function settle(requestId: number, value: T): void {
        pending.get(requestId)?.done(value);
    }

    return { open, settle };
}
