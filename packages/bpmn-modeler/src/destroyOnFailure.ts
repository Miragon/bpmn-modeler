/**
 * Runs `apply` against an already-allocated `handle`; if it rejects, destroys the
 * partial instance before rethrowing so a failed factory leaves its container and
 * document exactly as it found them.
 */
export async function destroyOnFailure<T extends { destroy(): void }>(
    handle: T,
    apply: () => void | Promise<void>,
): Promise<T> {
    try {
        await apply();
        return handle;
    } catch (error) {
        try {
            handle.destroy();
        } catch {
            // A secondary teardown failure must not mask the root cause.
        }
        throw error;
    }
}
