import { lastWorkspacePathSegment } from "./workspacePath";

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

/** The `paths` that no other of them holds, each once, in their first order. */
export function outermostPaths(paths: readonly string[]): string[] {
    const unique = [...new Set(paths)];
    return unique.filter(
        (path) => !unique.some((other) => other !== path && isWithinRoot(path, other)),
    );
}

/** The innermost of `folders` holding `path`, whatever order they were opened in; `undefined` outside them all. */
export function innermostFolderOf(path: string, folders: readonly string[]): string | undefined {
    return innermostHolding(path, folders)?.folder;
}

function innermostHolding(
    path: string,
    folders: readonly string[],
): { readonly folder: string; readonly belowFolder: string } | undefined {
    return folders
        .flatMap((folder) => {
            const belowFolder = relativeToRoot(path, folder);
            return belowFolder === undefined ? [] : [{ folder, belowFolder }];
        })
        .sort((a, b) => b.folder.length - a.folder.length)[0];
}

/**
 * `path` as VS Code's `asRelativePath` spells it, so both hosts order a file
 * list as VS Code shows it: below the innermost of `folders` holding it, led by
 * that folder's name when several are open, and unchanged outside them all.
 */
export function relativeToWorkspace(path: string, folders: readonly string[]): string {
    const innermost = innermostHolding(path, folders);
    if (innermost === undefined) {
        return path;
    }
    const { folder, belowFolder } = innermost;
    return folders.length > 1 ? `${lastWorkspacePathSegment(folder)}/${belowFolder}` : belowFolder;
}

function withTrailingSlash(path: string): string {
    return path.endsWith("/") ? path : `${path}/`;
}

// Rooted: a leading separator (posix, UNC, the current Windows drive) or a drive prefix.
const ROOTED_PATH = /^(?:[\\/]|[A-Za-z]:)/;

export function isRootedPath(path: string): boolean {
    return ROOTED_PATH.test(path);
}

/**
 * Whether a path written relative to a folder names that folder or something
 * below it. Both separators split, since an untrusted source can send either.
 */
export function staysInsideFolder(relativePath: string): boolean {
    return !isRootedPath(relativePath) && !relativePath.split(/[\\/]/).includes("..");
}
