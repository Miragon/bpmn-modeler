import { posix } from "path";

import { isWithinRoot } from "../../../kernel/domain/rootContainment";
import { joinWorkspacePath, parentWorkspacePath } from "../../../kernel/domain/workspacePath";
import { requestedPackageNameOf, RuleModuleRoot, RulePackage } from "./rulePackageApproval";

export type InstalledEntryKind = "file" | "directory" | "symbolicLink" | "other";

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

export type MemberKind = Exclude<RuleModuleRoot["kind"], "refused">;

export interface PackageManifest {
    readonly name: string;
    readonly version: string;
    /** Required, optional and peer dependencies alike: each one found is a member, and a missing one is skipped. */
    readonly dependencies: readonly string[];
}

export interface DependencyCandidate {
    readonly packageDir: string;
    /** Folders whose change could put a package here or take it away. */
    readonly watchedDirs: readonly string[];
}

export interface ClosureSize {
    /** Files and folders, each of which costs a stat on every lint. */
    readonly entries: number;
    readonly bytes: number;
}

export interface DependencyProbe {
    /** What Node loads before the folder: the name as a file, then with each extension it tries. */
    readonly files: readonly string[];
    readonly manifest: string;
    /** What Node loads from the folder when it holds no `package.json`. */
    readonly indexFiles: readonly string[];
}

/** The stamps of a `DependencyProbe`'s paths, in its order. */
export interface DependencyProbeStamps {
    readonly files: readonly (PathStamp | undefined)[];
    readonly manifest: PathStamp | undefined;
    readonly indexFiles: readonly (PathStamp | undefined)[];
}

export type DependencyLookup = "package" | "absent" | "unsupportedLayout";

export type ClosureRefusal =
    "linksOutsideFolder" | "tooLarge" | "unreadable" | "specialFile" | "unsupportedLayout";

/** A path a closure's digest depends on, with what it named then; `undefined` when nothing was there. */
export interface ClosureStamp {
    readonly path: string;
    readonly stamp: PathStamp | undefined;
}

export type ClosureFingerprint =
    | {
          readonly kind: "fingerprinted";
          readonly rulePackage: RulePackage;
          /** The root first, then every other member folder. */
          readonly memberDirs: readonly string[];
          readonly stamps: readonly ClosureStamp[];
      }
    | { readonly kind: "refused"; readonly reason: ClosureRefusal; readonly memberDir: string };

/**
 * About eight times the largest closure measured (@miragon/bpmnlint-plugin-rules
 * with its peers: 31 packages, about 650 files and folders, 4.55 MB, hashed in
 * about 10 ms and stat-checked in about 1 ms), so a full rehash stays near
 * 100 ms and the check at each lint start near 10 ms.
 */
export const CLOSURE_SIZE_LIMIT: ClosureSize = { entries: 5000, bytes: 50 * 1024 * 1024 };

const NODE_MODULES = "node_modules";
const MEMBER_ROOT_EXCLUSIONS: ReadonlySet<string> = new Set([NODE_MODULES, ".git"]);
const SELF_PACKAGE_MODEL_FILE = /(?:\.(?:bpmn|dmn|form)|^\.bpmnlintrc)$/;
const DEPENDENCY_FIELDS = ["dependencies", "optionalDependencies", "peerDependencies"] as const;
const FILE_EXTENSIONS = [".js", ".json", ".node"] as const;

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
 * Dev dependencies stay out: they are not installed for a dependent. A name
 * that is no package name is dropped, since joined under `node_modules` it
 * would leave it.
 */
export function packageManifestOf(text: string): PackageManifest | undefined {
    const manifest = parsedObject(text);
    if (manifest === undefined) {
        return undefined;
    }
    const names = DEPENDENCY_FIELDS.flatMap((field) => Object.keys(objectOrEmpty(manifest[field])));
    return {
        name: stringOrEmpty(manifest.name),
        version: stringOrEmpty(manifest.version),
        dependencies: [...new Set(names)]
            .filter((name) => requestedPackageNameOf(name) === name)
            .sort(),
    };
}

/**
 * Node's lookup order from a folder: its own `node_modules`, then each
 * ancestor's, skipping a folder that is itself a `node_modules`. Done by
 * hand, as `require.resolve("<name>/package.json")` fails on a package whose
 * `exports` hide its manifest.
 */
export function dependencyCandidates(fromDir: string, name: string): DependencyCandidate[] {
    const scope = name.includes("/") ? name.split("/")[0] : undefined;
    const candidates: DependencyCandidate[] = [];
    for (let dir: string | undefined = fromDir; dir !== undefined; dir = parentWorkspacePath(dir)) {
        if (posix.basename(dir) === NODE_MODULES) {
            continue;
        }
        const nodeModules = joinWorkspacePath(dir, NODE_MODULES);
        candidates.push({
            packageDir: joinWorkspacePath(nodeModules, name),
            watchedDirs:
                scope === undefined
                    ? [nodeModules]
                    : [nodeModules, joinWorkspacePath(nodeModules, scope)],
        });
    }
    return candidates;
}

export function dependencyProbeOf(packageDir: string): DependencyProbe {
    return {
        files: [packageDir, ...FILE_EXTENSIONS.map((extension) => `${packageDir}${extension}`)],
        manifest: joinWorkspacePath(packageDir, "package.json"),
        indexFiles: FILE_EXTENSIONS.map((extension) =>
            joinWorkspacePath(packageDir, `index${extension}`),
        ),
    };
}

/**
 * A file Node takes before the folder, or an index it takes from a folder
 * without a manifest, has no name and version to make it a member. Refusing
 * beats hashing a farther copy that Node does not load. A folder with
 * neither Node passes over, and so does the lookup.
 */
export function dependencyLookupOf(found: DependencyProbeStamps): DependencyLookup {
    if (found.files.some(isFileStamp)) {
        return "unsupportedLayout";
    }
    if (isFileStamp(found.manifest)) {
        return "package";
    }
    return found.indexFiles.some(isFileStamp) ? "unsupportedLayout" : "absent";
}

/**
 * Only a member's own `node_modules` (separate members) and `.git` stay out;
 * one deeper is content Node could load. The self-package also leaves out
 * the model files and the config being linted, so editing them asks nothing.
 * A folder or link with such a name stays in: `require("./rules.bpmn")` loads
 * `rules.bpmn/index.js`.
 */
export function isExcludedMemberEntry(
    relPath: string,
    entryKind: InstalledEntryKind,
    memberKind: MemberKind,
): boolean {
    if (MEMBER_ROOT_EXCLUSIONS.has(relPath)) {
        return true;
    }
    return (
        memberKind === "selfPackage" &&
        entryKind === "file" &&
        SELF_PACKAGE_MODEL_FILE.test(posix.basename(relPath))
    );
}

/** A linked folder could hold anything, or loop; only a link to a file inside the member stays. */
export function isLinkInsideMember(
    target: string | undefined,
    targetStamp: PathStamp | undefined,
    memberDir: string,
): boolean {
    return target !== undefined && targetStamp?.kind === "file" && isWithinRoot(target, memberDir);
}

export function exceedsClosureSizeLimit(
    totals: ClosureSize,
    limit: ClosureSize = CLOSURE_SIZE_LIMIT,
): boolean {
    return totals.entries > limit.entries || totals.bytes > limit.bytes;
}

function isFileStamp(stamp: PathStamp | undefined): boolean {
    return stamp?.kind === "file";
}

function parsedObject(text: string): Record<string, unknown> | undefined {
    try {
        const parsed: unknown = JSON.parse(text);
        return isPlainObject(parsed) ? parsed : undefined;
    } catch {
        return undefined;
    }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectOrEmpty(value: unknown): Record<string, unknown> {
    return isPlainObject(value) ? value : {};
}

function stringOrEmpty(value: unknown): string {
    return typeof value === "string" ? value : "";
}
