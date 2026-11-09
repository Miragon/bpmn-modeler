import { CodeApproval, needsContentHash } from "../../kernel/domain/codeApproval";
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

/** The stored rows inside a workspace folder that discovery missed, each once, read directly so a gone folder shows. */
export function missedRowIds(
    ownedRowIds: readonly string[],
    listedIds: readonly string[],
    folders: readonly string[],
): string[] {
    const listed = new Set(listedIds);
    return [...new Set(ownedRowIds)].filter((id) => !listed.has(id) && isInWorkspace(id, folders));
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
    readonly ownedRowIds: readonly string[];
}

/** Every rule package from any source, each once, inside a workspace folder. */
export function rulePackageIdsToList(
    folders: readonly string[],
    { installed, seen, ownedRowIds }: RulePackageIdSources,
): string[] {
    return [...new Set([...installed, ...seen, ...ownedRowIds])].filter((id) =>
        isInWorkspace(id, folders),
    );
}

export interface HashContext {
    /** The user asked to read these with "Review…". */
    readonly inspected: ReadonlySet<string>;
    readonly approvals: readonly CodeApproval[];
    readonly declined: ReadonlySet<string>;
}

/** Hashing reads every byte, so only for a package the user asked to read or a row or decline can match. */
export function isHashWanted(id: string, { inspected, approvals, declined }: HashContext): boolean {
    return inspected.has(id) || needsContentHash(id, approvals, declined);
}

function isInWorkspace(path: string, folders: readonly string[]): boolean {
    return folders.some((folder) => isWithinRoot(path, folder));
}
