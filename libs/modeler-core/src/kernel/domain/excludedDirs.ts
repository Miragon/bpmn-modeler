import { relativeToRoot } from "./rootContainment";

/**
 * Directory names that never contain user-authored sources worth searching
 * (process/decision models or implementation code). Dot-folders count as well
 * (see {@link isExcludedDirName}): version control, IDE and tool state, local
 * history copies and the modeler's own config folder.
 *
 * Every workspace listing skips them: `workspace.findFiles` through
 * {@link excludedDirsGlob}, the fs-walk fallback per directory, and the
 * watchers that keep a listing current. VS Code's default `files.exclude`
 * covers only a few version-control folders.
 */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set([
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    "bin",
    "coverage",
]);

const DOT_DIR_GLOB = ".*";

export function isExcludedDirName(name: string): boolean {
    return name.startsWith(".") || EXCLUDED_DIRS.has(name);
}

/**
 * The exclude a listing hands `WorkspacePort.findFiles`, so the host prunes
 * the excluded folders while it walks: the files inside them and inside
 * `additionalDirNames` at any depth below each workspace folder. A host takes
 * one exclude glob, so a caller's own folders join the same brace group.
 */
export function excludedDirsGlob(...additionalDirNames: string[]): string {
    return `**/{${[...EXCLUDED_DIRS, DOT_DIR_GLOB, ...additionalDirNames].join(",")}}/**`;
}

/**
 * True when an excluded folder lies between `root` and the file `path`. The
 * folders above `root` do not count, so a checkout under `~/build/` keeps its
 * files. A path outside `root` is judged by all its segments.
 */
export function isInsideExcludedDirBelow(path: string, root: string): boolean {
    return segmentsBelow(path, root).slice(0, -1).some(isExcludedDirName);
}

/** {@link isInsideExcludedDirBelow} for a folder, which may be excluded itself. */
export function isExcludedDirBelow(folder: string, root: string): boolean {
    return segmentsBelow(folder, root).some(isExcludedDirName);
}

function segmentsBelow(path: string, root: string): string[] {
    return (relativeToRoot(path, root) ?? path).split("/");
}
