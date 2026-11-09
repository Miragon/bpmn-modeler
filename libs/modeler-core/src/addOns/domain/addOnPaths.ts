import { isIgnoredWatchDirName } from "../../kernel/domain/excludedDirs";
import { relativeToRoot } from "../../kernel/domain/rootContainment";
import { joinWorkspacePath, parentWorkspacePath } from "../../kernel/domain/workspacePath";

const PLUGINS_AREA = "plugins";
const NODE_MODULES = "node_modules";

/** Where a workspace folder's own add-ons live, found before any editor opened. */
export function addOnScanDirsOf(
    root: string,
    configFolder: string,
): { readonly pluginsDir: string; readonly nodeModulesDir: string } {
    return {
        pluginsDir: joinWorkspacePath(root, configFolder, PLUGINS_AREA),
        nodeModulesDir: nodeModulesDirOf(root),
    };
}

export function nodeModulesDirOf(dir: string): string {
    return joinWorkspacePath(dir, NODE_MODULES);
}

/** The folder an add-on is listed under; `undefined` outside every folder, where none is listed. */
export function innermostFolderOf(path: string, folders: readonly string[]): string | undefined {
    return folders
        .filter((folder) => relativeToRoot(path, folder) !== undefined)
        .sort((a, b) => b.length - a.length)[0];
}

/**
 * A plugin is the folder `<dir>/<configFolder>/plugins/<name>`; its config
 * folder holds `plugins`. Nothing is above a filesystem root, which stays.
 */
export function configSourceDirOf(pluginId: string): string {
    const pluginsDir = parentWorkspacePath(pluginId) ?? pluginId;
    return parentWorkspacePath(pluginsDir) ?? pluginsDir;
}

/** The `node_modules` a rule package is installed in, or the folder of a package installed elsewhere. */
export function packagesSourceDirOf(rulePackageId: string): string {
    const segments = rulePackageId.split("/");
    const nodeModules = segments.lastIndexOf(NODE_MODULES);
    return nodeModules === -1 ? rulePackageId : segments.slice(0, nodeModules + 1).join("/");
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
