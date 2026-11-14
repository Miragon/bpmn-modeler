import { ancestorsUpTo } from "../../kernel/domain/ancestorsUpTo";
import { folderOfConfigFolder } from "../../kernel/domain/configArtifacts";
import { isIgnoredWatchDirName } from "../../kernel/domain/excludedDirs";
import { isWithinRoot, relativeToRoot } from "../../kernel/domain/rootContainment";

/**
 * The folders at or below `root` whose config folder holds `path` or is
 * `path`. A config folder inside an installed package or a build output, or
 * a path inside one, is not the workspace's own.
 */
export function configFolderHoldersOf(path: string, root: string, configFolder: string): string[] {
    const below = relativeToRoot(path, root);
    if (below === undefined || below.split("/").some(isIgnoredWatchDirName)) {
        return [];
    }
    return ancestorsUpTo(path, root).flatMap((dir) => {
        const holder = folderOfConfigFolder(dir, configFolder);
        return holder !== undefined && isWithinRoot(holder, root) ? [holder] : [];
    });
}

/**
 * Whether a change below `root` can change what the catalog lists: anything
 * in or of a config folder at any depth. Installed packages are not watched;
 * a refresh reads them again.
 */
export function affectsAddOns(path: string, root: string, configFolder: string): boolean {
    return configFolderHoldersOf(path, root, configFolder).length > 0;
}
