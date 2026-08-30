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
