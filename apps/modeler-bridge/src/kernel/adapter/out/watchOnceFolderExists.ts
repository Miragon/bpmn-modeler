import { statSync } from "node:fs";
import { dirname } from "node:path";

export interface Closable {
    close(): unknown;
}

export interface FolderWatchArming {
    /** Watches the folder itself; called once it exists. */
    arm(): Closable;
    /** Runs after an arming that waited: nothing created before it raised an event. */
    armedLate(): void;
    /** Watches the direct children of `folder`, calling `onChange` when one is added or removed. */
    watchChildren(folder: string, onChange: () => void): Closable;
}

function isFolder(path: string): boolean {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

function nearestExistingFolder(folder: string): string | undefined {
    for (let current = folder; ; current = dirname(current)) {
        if (isFolder(current)) {
            return current;
        }
        if (dirname(current) === current) {
            return undefined;
        }
    }
}

/**
 * Arms the watch of `folder` at once when it exists, and otherwise once it
 * appears, as chokidar and VS Code do. Until then only the direct children of
 * its nearest existing ancestor are watched, stepping down as each missing
 * folder appears, so a missing folder costs one watched directory and never a
 * recursive watch of an ancestor.
 */
export function watchOnceFolderExists(folder: string, arming: FolderWatchArming): Closable {
    if (isFolder(folder)) {
        return arming.arm();
    }
    let current: Closable | undefined;
    let closed = false;

    const step = (): void => {
        current?.close();
        current = undefined;
        const existing = nearestExistingFolder(folder);
        if (existing === folder) {
            // Thrown inside a watcher's event, the error would end the bridge.
            try {
                current = arming.arm();
            } catch {
                if (!isFolder(folder)) {
                    step();
                }
                return;
            }
            arming.armedLate();
            return;
        }
        if (existing === undefined) {
            return;
        }
        current = arming.watchChildren(existing, () => {
            if (!closed && nearestExistingFolder(folder) !== existing) {
                step();
            }
        });
        // A folder created between the lookup and the watch raised no event.
        if (nearestExistingFolder(folder) !== existing) {
            step();
        }
    };

    step();
    return {
        close: () => {
            closed = true;
            current?.close();
        },
    };
}
