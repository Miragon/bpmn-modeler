import { InstalledEntry, PathStamp } from "../domain/packageClosure";

export type { InstalledEntry, InstalledEntryKind, PathStamp } from "../domain/packageClosure";

/**
 * Reads installed packages on disk, so the core can fingerprint a workspace
 * rule package before it runs. Synchronous because bpmnlint resolves rules
 * through `require`, which cannot wait. Every path is absolute and spelled
 * like `toWorkspacePath`; a path that names nothing gives `undefined`.
 */
export interface InstalledPackagesPort {
    /** The path with every symbolic link on the way resolved. */
    realPath(path: string): string | undefined;
    /** A directory's entries in any order, each link reported as a link rather than followed. */
    listDirectory(path: string): InstalledEntry[] | undefined;
    /** What the path names, following links, so a retargeted link or a replaced file stamps differently. */
    stamp(path: string): PathStamp | undefined;
    /** SHA-256 of the file's bytes, never of a decoded text, as 64 lowercase hex digits. */
    sha256OfFile(path: string): string | undefined;
    /** SHA-256 of the text's UTF-8 bytes, as 64 lowercase hex digits. */
    sha256OfText(text: string): string;
    /** A file read as UTF-8, such as a `package.json`. */
    readTextFile(path: string): string | undefined;
}
