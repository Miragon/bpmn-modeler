import { isIgnoredWatchDirName } from "../../kernel/domain/excludedDirs";
import { relativeToRoot } from "../../kernel/domain/rootContainment";

/** The folder an add-on is listed under; `undefined` outside every folder, where none is listed. */
export function innermostFolderOf(path: string, folders: readonly string[]): string | undefined {
    return folders
        .filter((folder) => relativeToRoot(path, folder) !== undefined)
        .sort((a, b) => b.length - a.length)[0];
}

/**
 * Whether a change below `root` can change what the catalog lists: anything
 * in or of a config folder at any depth. Installed packages are not watched;
 * a refresh reads them again.
 */
export function affectsAddOns(path: string, root: string, configFolder: string): boolean {
    const below = relativeToRoot(path, root);
    if (below === undefined || below.split("/").some(isIgnoredWatchDirName)) {
        return false;
    }
    return `/${below}/`.includes(`/${configFolder}/`);
}
