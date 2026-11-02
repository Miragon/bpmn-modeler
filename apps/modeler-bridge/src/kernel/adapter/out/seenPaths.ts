import { posix } from "node:path";

/**
 * The `/`-separated paths a watch has seen exist. Each seen path is linked to
 * its parent folder, so forgetting a deleted folder forgets the paths below it
 * without visiting the rest: a branch switch deletes thousands of seen paths
 * in one burst.
 */
export class SeenPaths {
    private readonly seen = new Set<string>();
    private readonly seenBelow = new Map<string, Set<string>>();

    has(path: string): boolean {
        return this.seen.has(path);
    }

    add(path: string): void {
        this.seen.add(path);
        let child = path;
        let parent = posix.dirname(child);
        while (parent !== child) {
            const children = this.seenBelow.get(parent) ?? new Set<string>();
            if (children.has(child)) {
                return;
            }
            this.seenBelow.set(parent, children.add(child));
            child = parent;
            parent = posix.dirname(child);
        }
    }

    /** Forgets `path` and every seen path below it. */
    forget(path: string): void {
        this.seenBelow.get(posix.dirname(path))?.delete(path);
        const forgotten = [path];
        for (let next = forgotten.pop(); next !== undefined; next = forgotten.pop()) {
            this.seen.delete(next);
            for (const child of this.seenBelow.get(next) ?? []) {
                forgotten.push(child);
            }
            this.seenBelow.delete(next);
        }
    }
}
