import { posix } from "path";

const FILE_SCHEME = "file://";
const UNC_ROOT = /^[\\/]{2}(?=[^\\/])/;
const UNC_SHARE_ROOT = /^\/\/[^/]+\/[^/]+\/?$/;
const WINDOWS_DRIVE = /^[A-Za-z]:/;
const SLASHED_DRIVE_ROOT = /^\/[A-Za-z](:|%3A)\/?$/i;

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

/**
 * The directory holding `path`, or `undefined` at a root: the filesystem root,
 * a drive root (`file://C:`, `/c:`, `file:///c%3A`), or the share root of a
 * UNC path, spelled `//server/share`, `file:////server/share` or
 * `file://server/share`. Above a drive or share root, `/` names the current
 * drive on Windows and a server names no folder.
 */
export function parentWorkspacePath(path: string): string | undefined {
    const scheme = path.startsWith(FILE_SCHEME) ? FILE_SCHEME : "";
    const schemeless = path.slice(scheme.length);
    // VS Code puts a UNC server where IntelliJ puts a Windows drive.
    const namesServer =
        scheme !== "" && !schemeless.startsWith("/") && !WINDOWS_DRIVE.test(schemeless);
    if (
        SLASHED_DRIVE_ROOT.test(schemeless) ||
        UNC_SHARE_ROOT.test(namesServer ? `//${schemeless}` : schemeless)
    ) {
        return undefined;
    }
    const parent = posix.dirname(schemeless);
    return parent === schemeless || parent === "." ? undefined : scheme + parent;
}

/** The path a `file://` URI names, for the hosts that accept both spellings. */
export function withoutFileScheme(path: string): string {
    return path.startsWith(FILE_SCHEME) ? path.slice(FILE_SCHEME.length) : path;
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
