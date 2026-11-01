import { ancestorsUpTo } from "./ancestorsUpTo";
import { isWithinRoot } from "./rootContainment";
import { joinWorkspacePath, withoutFileScheme } from "./workspacePath";

/**
 * A nearest-first config lookup: it reads each of `entries`, paths relative to
 * a directory, in every directory from the document's up to the workspace root.
 * Both directories may be `file://` URIs, as the bridge answers for a
 * `file://` document.
 */
export interface ConfigLookup {
    readonly documentDirectory: string;
    readonly workspaceRoot: string;
    readonly entries: readonly string[];
}

/**
 * Whether a change at `changedPath`, spelled as watcher events are, can alter
 * what `lookup` finds: the path is one it reads, lies below one, or holds one,
 * as a folder moved in, moved out or deleted as a whole does.
 */
export function changesConfigLookup(changedPath: string, lookup: ConfigLookup): boolean {
    const directories = ancestorsUpTo(
        withoutFileScheme(lookup.documentDirectory),
        withoutFileScheme(lookup.workspaceRoot),
    );
    return directories.some((directory) =>
        lookup.entries.some((entry) => {
            const readPath = joinWorkspacePath(directory, entry);
            return isWithinRoot(changedPath, readPath) || isWithinRoot(readPath, changedPath);
        }),
    );
}
