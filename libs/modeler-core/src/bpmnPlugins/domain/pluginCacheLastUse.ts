/**
 * A copy folder's file that holds when an editor was last served the copy.
 * It holds only a time: VS Code's webview may load any file of the cache.
 */
export const LAST_USE_MARKER_FILE = "last-used";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Opening editors writes no marker more often than this. */
export const LAST_USE_REFRESH_MS = DAY_MS;

export const START_UP_IDLE_LIMIT_MS = 30 * DAY_MS;

/** "Remove unused plugin copies" leaves only what this process serves. */
export const ON_REQUEST_IDLE_LIMIT_MS = 0;

const EPOCH_MILLISECONDS = /^[0-9]+$/;

export function lastUseMarkerText(nowMs: number): string {
    return String(nowMs);
}

/** `undefined` for a missing or unreadable marker, which counts as unused. */
export function lastUseOf(markerText: string | undefined): number | undefined {
    if (markerText === undefined || !EPOCH_MILLISECONDS.test(markerText)) return undefined;
    const lastUse = Number(markerText);
    return Number.isSafeInteger(lastUse) ? lastUse : undefined;
}

/** Also after the clock went back, so a marker from a clock that ran ahead does not stay. */
export function shouldRefreshLastUse(lastWrittenMs: number | undefined, nowMs: number): boolean {
    return (
        lastWrittenMs === undefined ||
        nowMs < lastWrittenMs ||
        nowMs - lastWrittenMs >= LAST_USE_REFRESH_MS
    );
}

export interface CopyUse {
    /** Each copy's marker as read; a copy without one is missing. */
    readonly markerTextByCopy: ReadonlyMap<string, string>;
    /** The copies an editor of this process is served. */
    readonly inUse: ReadonlySet<string>;
    readonly nowMs: number;
    readonly maxIdleMs: number;
}

/**
 * The copies idle for at least the limit. A marker up to a day ahead counts
 * as used now, as another process can write one after this one read the
 * clock, or run on a clock a little ahead. One further ahead came from a clock
 * that ran far ahead and counts as unreadable, or it would stay for years.
 */
export function copiesToPrune(copies: readonly string[], use: CopyUse): string[] {
    return copies.filter((copy) => {
        if (use.inUse.has(copy)) return false;
        const lastUse = lastUseOf(use.markerTextByCopy.get(copy));
        if (lastUse === undefined || lastUse - use.nowMs > LAST_USE_REFRESH_MS) return true;
        return Math.max(0, use.nowMs - lastUse) >= use.maxIdleMs;
    });
}
