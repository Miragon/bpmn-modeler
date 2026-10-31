import { posix } from "path";

/**
 * `path` below the folder `root`: `""` for the root itself, `undefined` outside
 * it. Both must be spelled alike (see `toWorkspacePath`). A trailing slash is
 * ignored, so the filesystem root `/` and a drive root `C:/` contain their
 * paths and `/work` does not contain `/work2`.
 */
export function relativeToRoot(path: string, root: string): string | undefined {
    const rootPrefix = withTrailingSlash(root);
    const pathWithSlash = withTrailingSlash(path);
    if (!pathWithSlash.startsWith(rootPrefix)) {
        return undefined;
    }
    return pathWithSlash.slice(rootPrefix.length, -1);
}

export function isWithinRoot(path: string, root: string): boolean {
    return relativeToRoot(path, root) !== undefined;
}

/**
 * `path` as VS Code's `asRelativePath` spells it, so both hosts order a file
 * list as VS Code shows it: below the innermost of `folders` holding it, led by
 * that folder's name when several are open, and unchanged outside them all.
 */
export function relativeToWorkspace(path: string, folders: readonly string[]): string {
    const innermost = folders
        .flatMap((folder) => {
            const belowFolder = relativeToRoot(path, folder);
            return belowFolder === undefined ? [] : [{ folder, belowFolder }];
        })
        .sort((a, b) => a.belowFolder.length - b.belowFolder.length)[0];
    if (!innermost) {
        return path;
    }
    return folders.length > 1
        ? `${posix.basename(innermost.folder)}/${innermost.belowFolder}`
        : innermost.belowFolder;
}

function withTrailingSlash(path: string): string {
    return path.endsWith("/") ? path : `${path}/`;
}
