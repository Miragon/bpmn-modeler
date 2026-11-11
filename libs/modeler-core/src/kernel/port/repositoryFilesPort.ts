import { FileEntryKind } from "../domain/repositoryIdentity";

export type { FileEntryKind } from "../domain/repositoryIdentity";

/**
 * Reads the files that tell which repository holds code. Synchronous because
 * bpmnlint resolves rules through `require`, which cannot wait. Every path is
 * absolute and spelled like `toWorkspacePath`; a path that names nothing gives
 * `undefined`.
 */
export interface RepositoryFilesPort {
    /** The path with every symbolic link on the way resolved. */
    realPath(path: string): string | undefined;
    /** What the path itself is: a link is reported as a link, not followed. */
    entryKindOf(path: string): FileEntryKind | undefined;
    /** A file read as UTF-8, such as a `.git` file or a `package.json`. */
    readTextFile(path: string): string | undefined;
}
