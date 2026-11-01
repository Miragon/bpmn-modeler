import { isInsideExcludedDirBelow } from "./excludedDirs";
import type { WatcherEventKind } from "./watcherEvents";

/**
 * The glob a consumer of some files watches: a folder created or deleted as a
 * whole may arrive as one event for the folder, which a file-extension glob
 * filters out.
 */
export const EVERY_PATH_GLOB = "**/*";

/**
 * What one event below a watched root means to a consumer of its files:
 *
 * - `file` — one of its files changed.
 * - `folderCreated` / `folderDeleted` — another path was created or deleted.
 *   It may be a folder that arrived without events for its files, so it
 *   stands for the consumer's files below it.
 * - `unrelated` — a change of another path, or anything inside an
 *   {@link import("./excludedDirs").EXCLUDED_DIRS} directory below the root,
 *   which no workspace search lists.
 */
export type WatchedChange = "file" | "folderCreated" | "folderDeleted" | "unrelated";

export function watchedChangeOf(
    event: WatcherEventKind,
    path: string,
    root: string,
    isWatchedFile: (path: string) => boolean,
): WatchedChange {
    if (isInsideExcludedDirBelow(path, root)) {
        return "unrelated";
    }
    if (isWatchedFile(path)) {
        return "file";
    }
    if (event === "create") {
        return "folderCreated";
    }
    return event === "delete" ? "folderDeleted" : "unrelated";
}
