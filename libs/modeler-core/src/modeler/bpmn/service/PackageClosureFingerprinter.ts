import { joinWorkspacePath } from "../../../kernel/domain/workspacePath";
import {
    CLOSURE_SIZE_LIMIT,
    ClosureFingerprint,
    ClosureRefusal,
    ClosureSize,
    ClosureStamp,
    dependencyCandidates,
    dependencyLookupOf,
    dependencyProbeOf,
    exceedsClosureSizeLimit,
    FingerprintedRoot,
    InstalledEntryKind,
    isExcludedMemberEntry,
    isLinkInsideMember,
    MemberKind,
    PackageManifest,
    packageManifestOf,
    PathStamp,
    samePathStamp,
} from "../domain/packageClosure";
import {
    closureDigestInput,
    ClosureMember,
    memberDigestInput,
    PackageFileDigest,
    rulePackageContentHash,
} from "../domain/rulePackageApproval";
import { InstalledPackagesPort } from "../port/installedPackagesPort";

interface HashedFile {
    readonly stamp: PathStamp;
    readonly sha256: string;
}

interface MemberRecord {
    readonly kind: MemberKind;
    readonly manifest: PackageManifest;
    readonly digest: string;
    readonly stamps: readonly ClosureStamp[];
    readonly filesByRelPath: ReadonlyMap<string, HashedFile>;
    readonly size: ClosureSize;
}

interface WalkedFile {
    readonly relPath: string;
    readonly path: string;
    readonly stamp: PathStamp;
}

interface WalkedMember {
    readonly files: readonly WalkedFile[];
    readonly stamps: readonly ClosureStamp[];
    readonly size: ClosureSize;
}

type Refused = { readonly refused: ClosureRefusal };
type RefusedAt = Refused & { readonly memberDir: string };

const refused = (reason: ClosureRefusal): Refused => ({ refused: reason });
const isRefused = <T extends object>(value: T | Refused): value is Refused => "refused" in value;
const plus = (a: ClosureSize, b: ClosureSize): ClosureSize => ({
    entries: a.entries + b.entries,
    bytes: a.bytes + b.bytes,
});

/**
 * Fingerprints a rule package with everything it declares it runs with.
 * Build one per host process: its memo keeps each member's stamps and file
 * hashes, so a member is reread only when a stamp changed and then only the
 * files whose stamps changed. Every stamp is taken before the bytes are read,
 * so a write in between shows as a change on the next check, never as a stale
 * digest that matches.
 */
export class PackageClosureFingerprinter {
    private readonly members = new Map<string, MemberRecord>();

    constructor(
        private readonly packages: InstalledPackagesPort,
        private readonly sizeLimit: ClosureSize = CLOSURE_SIZE_LIMIT,
    ) {}

    fingerprint(root: FingerprintedRoot): ClosureFingerprint {
        const closure = new Map<string, MemberRecord>();
        const lookupStamps = new Map<string, ClosureStamp>();
        const queue = [root.id];
        let size: ClosureSize = { entries: 0, bytes: 0 };
        for (let dir = queue.shift(); dir !== undefined; dir = queue.shift()) {
            if (closure.has(dir)) {
                continue;
            }
            const member = this.memberAt(dir, dir === root.id ? root.kind : "package", size);
            if (isRefused(member)) {
                return { kind: "refused", reason: member.refused, memberDir: dir };
            }
            size = plus(size, member.size);
            closure.set(dir, member);
            for (const name of member.manifest.dependencies) {
                const found = this.resolveDependency(dir, name, lookupStamps);
                if (typeof found === "object") {
                    return { kind: "refused", reason: found.refused, memberDir: found.memberDir };
                }
                if (found !== undefined) {
                    queue.push(found);
                }
            }
        }
        return this.fingerprintOf(root, closure, [...lookupStamps.values()]);
    }

    /** Stats only, so it can run at the start of every lint. */
    isUnchanged(stamps: readonly ClosureStamp[]): boolean {
        return stamps.every(({ path, stamp }) => samePathStamp(this.packages.stamp(path), stamp));
    }

    private fingerprintOf(
        root: FingerprintedRoot,
        closure: ReadonlyMap<string, MemberRecord>,
        lookupStamps: readonly ClosureStamp[],
    ): ClosureFingerprint {
        const [[, rootRecord], ...others] = closure;
        const asMember = ({ manifest, digest }: MemberRecord): ClosureMember => ({
            name: manifest.name,
            version: manifest.version,
            digest,
        });
        const closureDigest = this.packages.sha256OfText(
            closureDigestInput(
                asMember(rootRecord),
                others.map(([, record]) => asMember(record)),
            ),
        );
        return {
            kind: "fingerprinted",
            rulePackage: {
                id: root.id,
                name: rootRecord.manifest.name,
                version: rootRecord.manifest.version,
                contentHash: rulePackageContentHash(closureDigest),
            },
            memberDirs: [...closure.keys()],
            stamps: [...[...closure.values()].flatMap(({ stamps }) => stamps), ...lookupStamps],
        };
    }

    private memberAt(
        dir: string,
        kind: MemberKind,
        closureSoFar: ClosureSize,
    ): MemberRecord | Refused {
        const remembered = this.members.get(dir);
        if (remembered?.kind === kind && this.isUnchanged(remembered.stamps)) {
            return exceedsClosureSizeLimit(plus(closureSoFar, remembered.size), this.sizeLimit)
                ? refused("tooLarge")
                : remembered;
        }
        const walked = this.walk(dir, kind, closureSoFar);
        if (isRefused(walked)) {
            return walked;
        }
        const record = this.read(dir, kind, walked, remembered?.filesByRelPath);
        if (!isRefused(record)) {
            this.members.set(dir, record);
        }
        return record;
    }

    private walk(dir: string, kind: MemberKind, closureSoFar: ClosureSize): WalkedMember | Refused {
        const stamps: ClosureStamp[] = [{ path: dir, stamp: this.packages.stamp(dir) }];
        const files: WalkedFile[] = [];
        let size: ClosureSize = { entries: 1, bytes: 0 };
        const folders = [{ path: dir, relPath: "" }];
        for (let folder = folders.pop(); folder !== undefined; folder = folders.pop()) {
            const entries = this.packages.listDirectory(folder.path);
            if (entries === undefined) {
                return refused("unreadable");
            }
            for (const entry of entries) {
                const relPath =
                    folder.relPath === "" ? entry.name : `${folder.relPath}/${entry.name}`;
                if (isExcludedMemberEntry(relPath, entry.kind, kind)) {
                    continue;
                }
                const path = joinWorkspacePath(folder.path, entry.name);
                const stamp = this.stampedEntry(dir, path, entry.kind);
                if (isRefused(stamp)) {
                    return stamp;
                }
                const isFolder = entry.kind === "directory";
                size = plus(size, { entries: 1, bytes: isFolder ? 0 : Number(stamp.size) });
                if (exceedsClosureSizeLimit(plus(closureSoFar, size), this.sizeLimit)) {
                    return refused("tooLarge");
                }
                stamps.push({ path, stamp });
                if (isFolder) {
                    folders.push({ path, relPath });
                } else {
                    files.push({ relPath, path, stamp });
                }
            }
        }
        return { files, stamps, size };
    }

    private stampedEntry(
        memberDir: string,
        path: string,
        kind: InstalledEntryKind,
    ): PathStamp | Refused {
        if (kind === "other") {
            return refused("specialFile");
        }
        const stamp = this.packages.stamp(path);
        if (
            kind === "symbolicLink" &&
            !isLinkInsideMember(this.packages.realPath(path), stamp, memberDir)
        ) {
            return refused("linksOutsideFolder");
        }
        return stamp ?? refused("unreadable");
    }

    private read(
        dir: string,
        kind: MemberKind,
        walked: WalkedMember,
        hashedBefore: ReadonlyMap<string, HashedFile> | undefined,
    ): MemberRecord | Refused {
        const filesByRelPath = new Map<string, HashedFile>();
        for (const { relPath, path, stamp } of walked.files) {
            const before = hashedBefore?.get(relPath);
            const sha256 =
                before !== undefined && samePathStamp(before.stamp, stamp)
                    ? before.sha256
                    : this.packages.sha256OfFile(path);
            if (sha256 === undefined) {
                return refused("unreadable");
            }
            filesByRelPath.set(relPath, { stamp, sha256 });
        }
        const manifestText = this.packages.readTextFile(joinWorkspacePath(dir, "package.json"));
        const manifest = packageManifestOf(manifestText ?? "");
        if (manifest === undefined) {
            return refused("unreadable");
        }
        const fileDigests: PackageFileDigest[] = [...filesByRelPath].map(
            ([relPath, { sha256 }]) => ({ relPath, sha256 }),
        );
        return {
            kind,
            manifest,
            digest: this.packages.sha256OfText(memberDigestInput(fileDigests)),
            stamps: walked.stamps,
            filesByRelPath,
            size: walked.size,
        };
    }

    /**
     * Stamps every folder it looks in, the package folders it passes over
     * included, so installing a missing or nearer copy shows as a change.
     */
    private resolveDependency(
        fromDir: string,
        name: string,
        lookupStamps: Map<string, ClosureStamp>,
    ): string | undefined | RefusedAt {
        for (const { packageDir, watchedDirs } of dependencyCandidates(fromDir, name)) {
            for (const path of [...watchedDirs, packageDir]) {
                lookupStamps.set(path, { path, stamp: this.packages.stamp(path) });
            }
            const probe = dependencyProbeOf(packageDir);
            const stampsOf = (paths: readonly string[]) =>
                paths.map((path) => this.packages.stamp(path));
            const lookup = dependencyLookupOf({
                files: stampsOf(probe.files),
                manifest: this.packages.stamp(probe.manifest),
                indexFiles: stampsOf(probe.indexFiles),
            });
            if (lookup === "unsupportedLayout") {
                return { ...refused(lookup), memberDir: packageDir };
            }
            if (lookup === "package") {
                return this.packages.realPath(packageDir);
            }
        }
        return undefined;
    }
}
