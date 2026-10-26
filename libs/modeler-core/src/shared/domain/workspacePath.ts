import { posix } from "path";

const FILE_SCHEME = "file://";
const UNC_ROOT = /^[\\/]{2}(?=[^\\/])/;

/**
 * The spelling of an absolute workspace path that hosts and the core exchange:
 * `/`-separated and normalised like `posix.normalize`, except that a UNC root
 * keeps its leading `//` and a `file://` scheme stays intact. `posix.normalize`
 * collapses both, and on Windows `/server/share/…` names a folder on the
 * current drive, not the share.
 */
export function toWorkspacePath(path: string): string {
    return joinWorkspacePath(path);
}

export function withoutFileScheme(path: string): string {
    return path;
}

/**
 * `posix.join` spelled like {@link toWorkspacePath}. Only `directory` can open
 * a UNC root: joining onto `/` must not turn `//.git` into one.
 */
export function joinWorkspacePath(directory: string, ...segments: string[]): string {
    const scheme = directory.startsWith(FILE_SCHEME) ? FILE_SCHEME : "";
    const path = directory.slice(scheme.length);
    const uncRoot = UNC_ROOT.test(path) ? "/" : "";
    const joined = [path, ...segments]
        .filter((segment) => segment !== "")
        .join("/")
        .replace(/\\/g, "/");
    return scheme + uncRoot + posix.normalize(joined);
}
