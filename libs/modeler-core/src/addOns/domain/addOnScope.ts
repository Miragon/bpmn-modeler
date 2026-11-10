import {
    CodeApproval,
    needsContentHash,
    notAskedAgain,
    SessionAnswer,
} from "../../kernel/domain/codeApproval";
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
    /** The rows of this kind, any of which may hold a package's content. */
    readonly approvals: readonly CodeApproval[];
    /** This session's answers, by `declineKeyOf`. */
    readonly answers: ReadonlyMap<string, SessionAnswer>;
}

/**
 * Hashing reads every byte, so only for a package the user asked to read, one
 * any row of its kind or a decline can match, or one a notice left to the
 * view: the gate hashed it to ask, and the view then offers to allow it
 * without a "Review…" first.
 */
export function isHashWanted(id: string, { inspected, approvals, answers }: HashContext): boolean {
    return inspected.has(id) || needsContentHash(id, approvals, notAskedAgain(answers));
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
