import { relativeToRoot } from "./rootContainment";

/**
 * Directory names that never contain user-authored sources worth searching
 * (process/decision models or implementation code).
 *
 * Every workspace listing skips them: `workspace.findFiles` through
 * {@link excludedDirsGlob}, the fs-walk fallback per directory. VS Code's
 * default `files.exclude` covers only the version-control folders among them.
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

/**
 * The exclude a listing hands `WorkspacePort.findFiles`, so the host prunes
 * these folders while it walks: the files inside {@link EXCLUDED_DIRS} and
 * `additionalDirNames` at any depth below each workspace folder. A host takes
 * one exclude glob, so a caller's own folders join the same brace group.
 */
export function excludedDirsGlob(...additionalDirNames: string[]): string {
    return `**/{${[...EXCLUDED_DIRS, ...additionalDirNames].join(",")}}/**`;
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

export function isExcludedDirBelow(_folder: string, _root: string): boolean {
    return false;
}
