import { createHash } from "node:crypto";
import { BigIntStats, Dirent, readdirSync, readFileSync, realpathSync, statSync } from "node:fs";

import {
    InstalledEntry,
    InstalledEntryKind,
    InstalledPackagesPort,
    PathStamp,
    toWorkspacePath,
} from "@miragon/bpmn-modeler-core";

/**
 * Reads realpaths with `realpathSync`, as Node's module loader does, so a
 * package root matches the file a `require` resolved to.
 * The bridge keeps a copy for its Bun runtime; the contract suite pins both.
 */
export class NodeInstalledPackages implements InstalledPackagesPort {
    realPath(path: string): string | undefined {
        return orUndefined(() => toWorkspacePath(realpathSync(path)));
    }

    listDirectory(path: string): InstalledEntry[] | undefined {
        return orUndefined(() =>
            readdirSync(path, { withFileTypes: true }).map((entry) => ({
                name: entry.name,
                kind: entryKindOf(entry),
            })),
        );
    }

    stamp(path: string): PathStamp | undefined {
        const stats = orUndefined(() => statSync(path, { bigint: true }));
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

    sha256OfFile(path: string): string | undefined {
        return orUndefined(() => createHash("sha256").update(readFileSync(path)).digest("hex"));
    }

    sha256OfText(text: string): string {
        return createHash("sha256").update(text, "utf8").digest("hex");
    }

    readTextFile(path: string): string | undefined {
        return orUndefined(() => readFileSync(path, "utf8"));
    }
}

type EntryTypes = Dirent | BigIntStats;

function entryKindOf(entry: EntryTypes): InstalledEntryKind {
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
