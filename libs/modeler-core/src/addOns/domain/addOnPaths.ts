import { isIgnoredWatchDirName } from "../../kernel/domain/excludedDirs";
import { relativeToRoot } from "../../kernel/domain/rootContainment";

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
