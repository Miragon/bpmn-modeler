import {
    BigIntStats,
    Dirent,
    lstatSync,
    readdirSync,
    readFileSync,
    realpathSync,
    Stats,
    statSync,
} from "node:fs";

import {
    fileSystemPathOf,
    InstalledEntry,
    InstalledEntryKind,
    InstalledPackagesPort,
    PathStamp,
    toWorkspacePath,
} from "@miragon/bpmn-modeler-core";

/**
 * Reads realpaths with `realpathSync`, as Node's module loader does, so a
 * package root matches the file a `require` resolved to. Every path goes
 * through `fileSystemPathOf` first, as a host spells a Windows path as
 * `uri.path` (`/c:/a`).
 * The bridge keeps a copy for its Bun runtime; the contract suite pins both.
 */
export class NodeInstalledPackages implements InstalledPackagesPort {
    realPath(path: string): string | undefined {
        return orUndefined(() => toWorkspacePath(realpathSync(fileSystemPathOf(path))));
    }

    entryKindOf(path: string): InstalledEntryKind | undefined {
        return orUndefined(() => kindOfEntry(lstatSync(fileSystemPathOf(path))));
    }

    listDirectory(path: string): InstalledEntry[] | undefined {
        return orUndefined(() =>
            readdirSync(fileSystemPathOf(path), { withFileTypes: true }).map((entry) => ({
                name: entry.name,
                kind: kindOfEntry(entry),
            })),
        );
    }

    stamp(path: string): PathStamp | undefined {
        const stats = orUndefined(() => statSync(fileSystemPathOf(path), { bigint: true }));
        return (
            stats && {
                kind: stampKindOf(stats),
                dev: stats.dev,
                ino: stats.ino,
                size: stats.size,
                mtimeNs: stats.mtimeNs,
                ctimeNs: stats.ctimeNs,
            }
        );
    }

    readTextFile(path: string): string | undefined {
        return orUndefined(() => readFileSync(fileSystemPathOf(path), "utf8"));
    }
}

type EntryTypes = Dirent | Stats | BigIntStats;

function kindOfEntry(entry: EntryTypes): InstalledEntryKind {
    return entry.isSymbolicLink() ? "symbolicLink" : stampKindOf(entry);
}

function stampKindOf(entry: EntryTypes): PathStamp["kind"] {
    if (entry.isDirectory()) {
        return "directory";
    }
    return entry.isFile() ? "file" : "other";
}

/** A missing path, a file where a folder is expected or a denied read all read as nothing there. */
function orUndefined<T>(read: () => T): T | undefined {
    try {
        return read();
    } catch {
        return undefined;
    }
}
