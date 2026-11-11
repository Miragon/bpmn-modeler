import { posix } from "path";

import {
    InstalledEntry,
    InstalledEntryKind,
    InstalledPackagesPort,
    PathStamp,
} from "../modeler/bpmn/port/installedPackagesPort";

type InMemoryNode =
    | { readonly kind: "file"; bytes: Uint8Array; readonly ino: bigint; time: bigint }
    | { readonly kind: "directory"; readonly ino: bigint; time: bigint }
    | { readonly kind: "link"; readonly target: string; readonly ino: bigint; time: bigint };

// As Linux's limit on links followed in one lookup.
const MAX_LINK_HOPS = 40;

/**
 * A posix file tree in memory. Every change ticks a clock that stamps the
 * entry and its parent directory, as a disk does with nanosecond times.
 * `directoriesListed` keeps every directory listed, so a spec can see whether
 * a check reread a package.
 */
export class InMemoryInstalledPackages implements InstalledPackagesPort {
    readonly directoriesListed: string[] = [];

    private readonly nodes = new Map<string, InMemoryNode>();
    private clock = 0n;
    private inodes = 0n;

    constructor() {
        this.nodes.set("/", { kind: "directory", ino: this.nextInode(), time: this.tick() });
    }

    writeFile(path: string, content: string | Uint8Array): void {
        const bytes = typeof content === "string" ? new TextEncoder().encode(content) : content;
        const existing = this.nodes.get(path);
        if (existing?.kind === "file") {
            existing.bytes = bytes;
            existing.time = this.tick();
            return;
        }
        this.addEntry(path, { kind: "file", bytes, ino: this.nextInode(), time: this.tick() });
    }

    createDirectory(path: string): void {
        if (this.nodes.get(path)?.kind === "directory") {
            return;
        }
        this.addEntry(path, { kind: "directory", ino: this.nextInode(), time: this.tick() });
    }

    createSymbolicLink(path: string, target: string): void {
        this.addEntry(path, { kind: "link", target, ino: this.nextInode(), time: this.tick() });
    }

    /** Removes the entry and everything below it, as `rm -r` would. */
    remove(path: string): void {
        for (const each of [...this.nodes.keys()]) {
            if (each === path || each.startsWith(`${path}/`)) {
                this.nodes.delete(each);
            }
        }
        this.touch(posix.dirname(path));
    }

    realPath(path: string): string | undefined {
        return this.resolve(path, 0);
    }

    entryKindOf(path: string): InstalledEntryKind | undefined {
        const parent = this.realPath(posix.dirname(path));
        const node =
            parent === undefined
                ? undefined
                : this.nodes.get(posix.join(parent, posix.basename(path)));
        return node === undefined ? undefined : kindOfNode(node);
    }

    listDirectory(path: string): InstalledEntry[] | undefined {
        const directory = this.realPath(path);
        if (directory === undefined || this.nodes.get(directory)?.kind !== "directory") {
            return undefined;
        }
        this.directoriesListed.push(path);
        return [...this.nodes]
            .filter(([each]) => each !== directory && posix.dirname(each) === directory)
            .map(([each, node]) => ({ name: posix.basename(each), kind: kindOfNode(node) }));
    }

    stamp(path: string): PathStamp | undefined {
        const node = this.nodeAt(path);
        if (node === undefined || node.kind === "link") {
            return undefined;
        }
        return {
            kind: node.kind,
            dev: 1n,
            ino: node.ino,
            size: node.kind === "file" ? BigInt(node.bytes.length) : 0n,
            mtimeNs: node.time,
            ctimeNs: node.time,
        };
    }

    readTextFile(path: string): string | undefined {
        const node = this.nodeAt(path);
        return node?.kind === "file" ? new TextDecoder().decode(node.bytes) : undefined;
    }

    private nodeAt(path: string): InMemoryNode | undefined {
        const real = this.realPath(path);
        return real === undefined ? undefined : this.nodes.get(real);
    }

    private resolve(path: string, hops: number): string | undefined {
        let resolved = "/";
        for (const segment of path.split("/").filter((each) => each !== "")) {
            const candidate = posix.join(resolved, segment);
            const node = this.nodes.get(candidate);
            if (node === undefined) {
                return undefined;
            }
            if (node.kind !== "link") {
                resolved = candidate;
                continue;
            }
            if (hops >= MAX_LINK_HOPS) {
                return undefined;
            }
            const target = this.resolve(posix.resolve(resolved, node.target), hops + 1);
            if (target === undefined) {
                return undefined;
            }
            resolved = target;
        }
        return resolved;
    }

    private addEntry(path: string, node: InMemoryNode): void {
        const parent = posix.dirname(path);
        this.createDirectory(parent);
        this.nodes.set(path, node);
        this.touch(parent);
    }

    private touch(path: string): void {
        const node = this.nodes.get(path);
        if (node !== undefined) {
            node.time = this.tick();
        }
    }

    private tick(): bigint {
        this.clock += 1n;
        return this.clock;
    }

    private nextInode(): bigint {
        this.inodes += 1n;
        return this.inodes;
    }
}

function kindOfNode(node: InMemoryNode): InstalledEntryKind {
    return node.kind === "link" ? "symbolicLink" : node.kind;
}
