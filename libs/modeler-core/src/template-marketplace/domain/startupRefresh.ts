import { CachedSourceSlot } from "./sourceCacheRefresh";

export const MARKETPLACE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * A marketplace without a cached source, or with one fetched too long ago to
 * trust, is fetched again when the host starts. A stamp the cache cannot date
 * (an earlier version wrote none) or that lies in the future counts as stale.
 */
export function needsStartupRefresh(slots: readonly CachedSourceSlot[], now: number): boolean {
    return slots.length === 0 || slots.some((slot) => isStale(slot.fetchedAt, now));
}

function isStale(fetchedAt: number | undefined, now: number): boolean {
    return (
        fetchedAt === undefined || fetchedAt > now || now - fetchedAt >= MARKETPLACE_CACHE_TTL_MS
    );
}
