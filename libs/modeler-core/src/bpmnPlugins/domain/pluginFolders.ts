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

/** The editors that were offered any of `pluginIds`, each once, in the map's order. */
export function editorsOfferedAnyOf(
    offeredByEditor: ReadonlyMap<string, readonly string[]>,
    pluginIds: readonly string[],
): string[] {
    const wanted = new Set(pluginIds);
    return [...offeredByEditor]
        .filter(([, offered]) => offered.some((id) => wanted.has(id)))
        .map(([editorId]) => editorId);
}
