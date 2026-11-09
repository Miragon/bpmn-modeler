import {
    ApprovableArtifact,
    approvalStateOf,
    CodeApproval,
} from "../../kernel/domain/codeApproval";
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

/** What an editor's last plugin answer held, each plugin at the content it was read with. */
export interface OfferedPlugins {
    readonly served: readonly ApprovableArtifact[];
    /** Every plugin found but not allowed, whether a notice still asks about it or not. */
    readonly withheld: readonly ApprovableArtifact[];
}

/**
 * The editors whose modules no longer match the approvals, each once in the
 * map's order: one serves a plugin not allowed at that content any more, or
 * was withheld one now allowed at the content it was offered.
 */
export function editorsToReload(
    offeredByEditor: ReadonlyMap<string, OfferedPlugins>,
    approvals: readonly CodeApproval[],
): string[] {
    const isApproved = (plugin: ApprovableArtifact) =>
        approvalStateOf(plugin, approvals) === "approved";
    return [...offeredByEditor]
        .filter(
            ([, { served, withheld }]) =>
                served.some((plugin) => !isApproved(plugin)) || withheld.some(isApproved),
        )
        .map(([editorId]) => editorId);
}

/** A directory entry name that names a folder inside the plugins folder, whatever a host lists. */
export function isPluginFolderName(name: string): boolean {
    return name !== "" && name !== "." && name !== ".." && !/[\\/]/.test(name);
}
