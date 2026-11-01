import { relativeToRoot } from "./rootContainment";

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
    "bin",
    "coverage",
    ".git",
    ".svn",
    ".hg",
]);

export function excludedDirsGlob(..._additionalDirNames: string[]): string {
    return "";
}

/**
 * True when an {@link EXCLUDED_DIRS} entry lies between `root` and `path`. The
 * directories above `root` do not count, so a checkout under `~/build/` keeps
 * its files. A path outside `root` is judged by all its segments.
 */
export function isInsideExcludedDirBelow(path: string, root: string): boolean {
    const judgedPath = relativeToRoot(path, root) ?? path;
    return judgedPath.split("/").some((segment) => EXCLUDED_DIRS.has(segment));
}

/**
 * {@link isInsideExcludedDirBelow} for the innermost of `folders` that holds
 * `path`, so a folder opened inside another folder's build output keeps its
 * files. Every other folder sees the same segments or more, so it never
 * answers `false` where the innermost one answers `true`.
 */
export function isInsideExcludedDirBelowEveryFolder(
    path: string,
    folders: readonly string[],
): boolean {
    return folders.every((folder) => isInsideExcludedDirBelow(path, folder));
}
