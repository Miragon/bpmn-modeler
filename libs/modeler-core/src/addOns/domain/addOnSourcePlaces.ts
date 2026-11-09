import { folderOfConfigFolder } from "../../kernel/domain/configArtifacts";
import { relativeToRoot } from "../../kernel/domain/rootContainment";
import { lastWorkspacePathSegment } from "../../kernel/domain/workspacePath";
import type { AddOnView } from "./addOnCatalogModel";
import { AddOnKind, SourceKind } from "./addOnIds";

/** Where every kind's owner looked: the open folders and the config folder's name. */
export interface FolderFacts {
    readonly folders: readonly string[];
    readonly configFolder: string;
}

export type FolderSourceKind = Exclude<SourceKind, "marketplace">;

export interface SourcePlace {
    readonly kind: FolderSourceKind;
    readonly dir: string;
    /** The folder whose diagrams it applies to, for a config folder of the current setting. */
    readonly appliesTo?: string;
    /** Sorts the root's own config folder first. */
    readonly rank: number;
}

/** One row of a workspace folder, placed in the innermost folder and the source it comes from. */
export interface PlacedAddOn {
    readonly root: string;
    readonly source: SourcePlace;
    readonly view: AddOnView;
}

function configFolderPlace(dir: string, root: string, configFolder: string): SourcePlace {
    const appliesTo = folderOfConfigFolder(dir, configFolder);
    return { kind: "configFolder", dir, appliesTo, rank: appliesTo === root ? 0 : 1 };
}

export const SOURCE_PLACE: Record<
    AddOnKind,
    (dir: string, root: string, configFolder: string) => SourcePlace
> = {
    plugin: configFolderPlace,
    elementTemplate: configFolderPlace,
    rulePackage: (dir) => ({ kind: "installedPackages", dir, rank: 2 }),
};

export function sourceLabelOf(place: SourcePlace, root: string): string {
    return relativeToRoot(place.dir, root) || lastWorkspacePathSegment(place.dir);
}
