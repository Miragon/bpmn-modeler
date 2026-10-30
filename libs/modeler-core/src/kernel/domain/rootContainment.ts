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

export function relativeToWorkspace(_path: string, _folders: readonly string[]): string {
    return "";
}

function withTrailingSlash(path: string): string {
    return path.endsWith("/") ? path : `${path}/`;
}
