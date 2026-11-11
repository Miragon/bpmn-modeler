import { isWithinRoot } from "../../kernel/domain/rootContainment";

/** Where one kind of add-on sits in config folders: a plugins or a templates folder. */
export interface ConfigAreaDirsScope {
    readonly folders: readonly string[];
    /** Each folder's own area folder, as the owner places it. */
    readonly rootDirs: readonly string[];
    /** The area folders an editor or a listing looked in, nested ones included. */
    readonly knownDirs: readonly string[];
}

/** Each folder's own area folder, and every known one inside a workspace folder. */
export function configAreaDirsToList({
    folders,
    rootDirs,
    knownDirs,
}: ConfigAreaDirsScope): string[] {
    return [...rootDirs, ...knownDirs.filter((dir) => isInWorkspace(dir, folders))];
}

/** Each folder, and each lint config folder read so far inside one: their `node_modules` hold the packages. */
export function rulePackageDirsToList(
    folders: readonly string[],
    lintConfigDirs: readonly string[],
): string[] {
    return [...folders, ...lintConfigDirs.filter((dir) => isInWorkspace(dir, folders))];
}

export interface RulePackageIdSources {
    /** By real folder, which a link can put outside every workspace folder. */
    readonly installed: readonly string[];
    /** Reported by the gate. */
    readonly seen: readonly string[];
}

/** Every rule package from any source, each once, inside a workspace folder. */
export function rulePackageIdsToList(
    folders: readonly string[],
    { installed, seen }: RulePackageIdSources,
): string[] {
    return [...new Set([...installed, ...seen])].filter((id) => isInWorkspace(id, folders));
}

/**
 * Whether "Review…" can leave pending code to a view: only when the view lists
 * every item, which it does for code inside a workspace folder. All or
 * nothing, as one item the view does not list could be allowed nowhere.
 */
export function leavesToView(artifactIds: readonly string[], folders: readonly string[]): boolean {
    return folders.length > 0 && artifactIds.every((id) => isInWorkspace(id, folders));
}

function isInWorkspace(path: string, folders: readonly string[]): boolean {
    return folders.some((folder) => isWithinRoot(path, folder));
}
