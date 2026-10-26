export type WatcherEventKind = "create" | "change" | "delete";

/**
 * The one event a burst of events for one path is delivered as, coalesced the
 * way VS Code's file watcher coalesces them; `undefined` when the burst leaves
 * nothing to report.
 */
export function coalesceWatcherEvents(
    pending: WatcherEventKind | undefined,
    next: WatcherEventKind,
): WatcherEventKind | undefined {
    if (pending === "create") {
        return next === "delete" ? undefined : "create";
    }
    if (pending === "delete" && next === "create") {
        return "change";
    }
    return next;
}
