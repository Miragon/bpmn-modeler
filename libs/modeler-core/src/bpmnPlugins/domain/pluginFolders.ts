import { relativeToRoot } from "../../kernel/domain/rootContainment";
import { joinWorkspacePath } from "../../kernel/domain/workspacePath";

export type PluginFolderChange =
    | { readonly kind: "folder"; readonly folder: string }
    | { readonly kind: "everyFolder" }
    | { readonly kind: "none" };

/**
 * Which plugin folder a change below `<configFolder>/plugins` touches. Every
 * plugin is one subfolder, so any path below it, the folder itself included,
 * stands for that plugin.
 */
export function pluginFolderChangedBy(path: string, pluginsDir: string): PluginFolderChange {
    const below = relativeToRoot(path, pluginsDir);
    if (below === undefined) {
        return { kind: "none" };
    }
    if (below === "") {
        return { kind: "everyFolder" };
    }
    return { kind: "folder", folder: joinWorkspacePath(pluginsDir, below.split("/")[0]) };
}

/** A directory entry name that names a folder inside the plugins folder, whatever a host lists. */
export function isPluginFolderName(name: string): boolean {
    return name !== "" && name !== "." && name !== ".." && !/[\\/]/.test(name);
}
