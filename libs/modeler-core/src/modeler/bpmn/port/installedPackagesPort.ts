import { RepositoryFilesPort } from "../../../kernel/port/repositoryFilesPort";
import { InstalledEntry, PathStamp } from "../domain/installedPackage";

export type { InstalledEntry, InstalledEntryKind, PathStamp } from "../domain/installedPackage";

/**
 * Reads installed packages on disk, so the core can find, name and stamp a
 * workspace rule package before it runs. Synchronous because bpmnlint resolves rules
 * through `require`, which cannot wait. Every path is absolute and spelled
 * like `toWorkspacePath`; a path that names nothing gives `undefined`.
 */
export interface InstalledPackagesPort extends RepositoryFilesPort {
    /** A directory's entries in any order, each link reported as a link rather than followed. */
    listDirectory(path: string): InstalledEntry[] | undefined;
    /** What the path names, following links, so a retargeted link or a replaced file stamps differently. */
    stamp(path: string): PathStamp | undefined;
}
