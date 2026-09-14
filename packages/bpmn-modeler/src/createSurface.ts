/**
 * Owns a surface from allocation through its initial-options phase. If any phase
 * throws, the partial instance is destroyed (guarded, so a secondary teardown
 * failure never masks the root cause) before the original error is rethrown, so
 * a failed factory leaves its container and document exactly as it found them.
 *
 * `allocate` stays cheap on purpose — the real allocation risk is the bpmn-js
 * constructor, which each facade runs inside `applyInitialOptions` (its `init`)
 * behind a guard that clears the container of any partially-attached DOM.
 */
export async function createSurface<T extends { destroy(): void }>(
    allocate: () => T,
    applyInitialOptions: (surface: T) => void | Promise<void>,
): Promise<T> {
    const surface = allocate();
    try {
        await applyInitialOptions(surface);
        return surface;
    } catch (error) {
        try {
            surface.destroy();
        } catch {
            // A secondary teardown failure must not mask the root cause.
        }
        throw error;
    }
}
