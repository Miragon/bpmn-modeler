import { posix } from "path";

import {
    isScopeFolderName,
    NODE_MODULES,
    nodeModulesDirOf,
} from "../../../kernel/domain/installedPackagePath";
import { FileEntryKind } from "../../../kernel/domain/repositoryIdentity";
import { joinWorkspacePath, parentWorkspacePath } from "../../../kernel/domain/workspacePath";

export type InstalledEntryKind = FileEntryKind;

export interface InstalledEntry {
    readonly name: string;
    readonly kind: InstalledEntryKind;
}

/**
 * What a path names at one moment. A replaced file gets a new inode, and the
 * change time cannot be set back, so an unchanged stamp means unchanged bytes
 * without reading them.
 */
export interface PathStamp {
    readonly kind: Exclude<InstalledEntryKind, "symbolicLink">;
    readonly dev: bigint;
    readonly ino: bigint;
    readonly size: bigint;
    readonly mtimeNs: bigint;
    readonly ctimeNs: bigint;
}

export interface DependencyCandidate {
    readonly packageDir: string;
}

export function samePathStamp(a: PathStamp | undefined, b: PathStamp | undefined): boolean {
    if (a === undefined || b === undefined) {
        return a === b;
    }
    return (
        a.kind === b.kind &&
        a.dev === b.dev &&
        a.ino === b.ino &&
        a.size === b.size &&
        a.mtimeNs === b.mtimeNs &&
        a.ctimeNs === b.ctimeNs
    );
}

/**
 * Node's lookup order from a folder: its own `node_modules`, then each
 * ancestor's, skipping a folder that is itself a `node_modules`. Done by
 * hand, as `require.resolve("<name>/package.json")` fails on a package whose
 * `exports` hide its manifest.
 */
export function dependencyCandidates(fromDir: string, name: string): DependencyCandidate[] {
    const candidates: DependencyCandidate[] = [];
    for (let dir: string | undefined = fromDir; dir !== undefined; dir = parentWorkspacePath(dir)) {
        if (posix.basename(dir) !== NODE_MODULES) {
            candidates.push({ packageDir: joinWorkspacePath(nodeModulesDirOf(dir), name) });
        }
    }
    return candidates;
}

/** bpmnlint resolves plugin `acme` to `bpmnlint-plugin-acme`, and `@scope` or `@scope/acme` inside the scope. */
const RULE_PACKAGE_FOLDER_NAME = /^bpmnlint-plugin(?:-.+)?$/;

const isPackageFolder = ({ kind }: InstalledEntry) =>
    kind === "directory" || kind === "symbolicLink";

/** The scope folders of a `node_modules` listing, each listed for the rule packages inside it. */
export function rulePackageScopesToList(entries: readonly InstalledEntry[]): string[] {
    return entries
        .filter((entry) => isPackageFolder(entry) && isScopeFolderName(entry.name))
        .map(({ name }) => name);
}

/** The rule packages installed in one `node_modules`, by their name below it, in sorted order. */
export function rulePackageFolderNames(
    entries: readonly InstalledEntry[],
    scopedEntries: ReadonlyMap<string, readonly InstalledEntry[]>,
): string[] {
    const ruleFolders = (listed: readonly InstalledEntry[]) =>
        listed
            .filter((entry) => isPackageFolder(entry) && RULE_PACKAGE_FOLDER_NAME.test(entry.name))
            .map(({ name }) => name);
    return [
        ...ruleFolders(entries),
        ...[...scopedEntries].flatMap(([scope, listed]) =>
            ruleFolders(listed).map((name) => `${scope}/${name}`),
        ),
    ].sort();
}
