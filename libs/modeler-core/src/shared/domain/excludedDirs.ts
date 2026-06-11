/**
 * Directory names that never contain user-authored sources worth searching
 * (process/decision models or implementation code).
 *
 * Applied uniformly to both workspace-search code paths: as a post-filter on
 * the `workspace.findFiles` result, and per-directory during the fs-walk
 * fallback. VS Code's default `files.exclude` / `search.exclude` only cover a
 * subset of these (notably `**\/node_modules`), so the platform defaults alone
 * are not enough.
 */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    "coverage",
    ".git",
    ".svn",
    ".hg",
]);

/**
 * True when any path segment is an {@link EXCLUDED_DIRS} entry — used to drop
 * `findFiles` hits buried in build/output trees the VS Code defaults miss.
 */
export function pathIsInsideExcludedDir(path: string): boolean {
    for (const segment of path.split("/")) {
        if (segment !== "" && EXCLUDED_DIRS.has(segment)) {
            return true;
        }
    }
    return false;
}
