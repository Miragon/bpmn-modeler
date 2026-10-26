export type WatcherEventKind = "create" | "change" | "delete";

export function coalesceWatcherEvents(
    _pending: WatcherEventKind | undefined,
    next: WatcherEventKind,
): WatcherEventKind | undefined {
    return next;
}
