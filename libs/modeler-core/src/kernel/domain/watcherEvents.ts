export type WatcherEventKind = "create" | "change" | "delete";

/**
 * The one event a burst of events for one path is delivered as, coalesced the
 * way VS Code's file watcher coalesces them, except that a create followed by
 * a delete still reports the delete: a consumer may have read the file before
 * the burst was delivered.
 */
export function coalesceWatcherEvents(
    pending: WatcherEventKind | undefined,
    next: WatcherEventKind,
): WatcherEventKind {
    if (pending === "create" && next === "change") {
        return "create";
    }
    if (pending === "delete" && next === "create") {
        return "change";
    }
    return next;
}
