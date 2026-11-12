import { Allowance, allowanceStateOf } from "../../../../../kernel/domain/allowance";
import { AllowanceKind } from "../../../../../kernel/domain/approvalRowKind";
import { CodeApproval } from "../../../../../kernel/domain/codeApproval";
import { isRootedPath, isWithinRoot } from "../../../../../kernel/domain/rootContainment";
import { fileSystemPathOf, toWorkspacePath } from "../../../../../kernel/domain/workspacePath";
import { PluginApprovalStorePort } from "../../../../../kernel/port/approvalPorts";
import { WorkspaceTrustPort } from "../../../../../kernel/port/hostPorts";
import {
    dependencyCandidates,
    manifestPathOf,
    packageManifestOf,
    PathStamp,
    samePathStamp,
} from "../../../domain/installedPackage";
import {
    AllowableRoot,
    BlockedRulePackage,
    CurrentPackageFolder,
    currentFolderRequestOf,
    currentResolutionOf,
    evictionScopeOf,
    loadsWithoutApproval,
    requestedPackageNameOf,
    rootStampPathsOf,
    rulePackageOf,
} from "../../../domain/rulePackageApproval";
import {
    approvalRootOf,
    RefusedModule,
    RefusedRuleModule,
} from "../../../domain/rulePackageRefusal";
import { InstalledPackagesPort } from "../../../port/installedPackagesPort";
import { RequestAttribution } from "./CompositeResolver";

/** What the gate needs of `AllowanceLocator`; an adapter imports no service. */
interface RuleRootAllowances {
    allowanceAt(kind: AllowanceKind, folder: string): Allowance;
}

/** What a host wires so that the workspace rule packages the user allowed run. */
export interface RulePackageSources {
    readonly approvals: Pick<PluginApprovalStorePort, "read">;
    readonly packages: InstalledPackagesPort;
    readonly allowances: RuleRootAllowances;
    /** `allowanceKeyOf` of each rule package declined this session. */
    readonly declinedThisSession?: () => ReadonlySet<string>;
    /** Absent: the workspace counts as trusted. Untrusted, no workspace package is even resolved. */
    readonly trust?: Pick<WorkspaceTrustPort, "isTrusted">;
}

export interface RulePackageGateOptions {
    readonly sources: RulePackageSources;
    /** The rows the lint setup was built for; other rows build another setup. */
    readonly approvals: readonly CodeApproval[];
    /** The `.bpmnlintrc` folder the scoped require looks up from, spelled like `toWorkspacePath`. */
    readonly configDir: string;
    /** The root's package.json stamp it was last loaded under, kept across setups by NodeBpmnLinter. */
    readonly loadedManifestStamps: Map<string, PathStamp | undefined>;
    /** A require that looks up from inside a folder, spelled as Node's `require` takes it. */
    readonly requireFrom: (dir: string) => NodeRequire;
}

interface StampedPath {
    readonly path: string;
    readonly stamp: PathStamp | undefined;
}

/** A package folder a bare name led to: the path looked up, and where its links end. */
interface PackageLookup extends CurrentPackageFolder {
    readonly lookupDir: string;
}

interface ResolvedRequest {
    /** Spelled as Node's `require` takes it. */
    readonly file: string;
    readonly lookup: PackageLookup | undefined;
}

type ModuleCache = NodeRequire["cache"];

const NO_DECLINES: ReadonlySet<string> = new Set();

/**
 * Lets a workspace rule package run only while the user's allowance covers
 * its root. It wraps the scoped require NodeResolver loads packages with, so
 * it decides before any of their code runs: synchronously, as `require`
 * cannot wait, and without module loader hooks, which Bun does not fire.
 * One gate serves one lint setup.
 *
 * Each root bpmnlint requests needs its own allowance. A package's own
 * `require` calls are Node's, not this gate's, so what it loads from its
 * dependencies runs under the package's allowance.
 */
export class RulePackageGate implements RequestAttribution {
    /** The stamps each admitted root was admitted under, so a changed manifest builds a new setup. */
    private readonly admitted = new Map<string, readonly StampedPath[]>();
    private readonly blocked = new Map<string, Omit<BlockedRulePackage, "needed">>();
    /** By the refused file. */
    private readonly refused = new Map<string, RefusedRuleModule>();
    private readonly allowanceByRoot = new Map<string, Allowance>();
    private readonly evictedStaleRoots = new Set<string>();
    private request: { readonly pkg: string; readonly blocked: Set<string> } | undefined;
    private readonly realConfigDir: string;
    private readonly selfPackageName: string | undefined;

    constructor(private readonly options: RulePackageGateOptions) {
        const { packages } = options.sources;
        this.realConfigDir = packages.realPath(options.configDir) ?? options.configDir;
        const manifest = packages.readTextFile(manifestPathOf(this.realConfigDir));
        this.selfPackageName = packageManifestOf(manifest ?? "")?.name;
    }

    /** Its `resolve` answers like the require, so NodeResolver's `dirname(require.resolve(pkg))` names the current folder. */
    require(scopedRequire: NodeRequire): NodeRequire {
        const resolve = (request: string) => this.currentResolution(request, scopedRequire).file;
        const gated = (request: string): unknown => {
            const { file, lookup } = this.currentResolution(request, scopedRequire);
            if (!loadsWithoutApproval(toWorkspacePath(file))) {
                this.admit(file, request, lookup, scopedRequire.cache);
            }
            return scopedRequire(file);
        };
        return Object.assign(gated, { resolve }) as unknown as NodeRequire;
    }

    beginRequest(pkg: string): void {
        this.request = { pkg, blocked: new Set() };
    }

    blockedSinceBegin(): readonly string[] {
        return [...(this.request?.blocked ?? [])];
    }

    refusedModules(): RefusedRuleModule[] {
        return [...this.refused.values()];
    }

    blockedPackages(needed: ReadonlySet<string>): BlockedRulePackage[] {
        return [...this.blocked.values()].map((each) => ({ ...each, needed: needed.has(each.id) }));
    }

    /** Stats only, so the linter can ask before every run. */
    isUnchanged(): boolean {
        const { packages } = this.options.sources;
        return [...this.admitted.values()].every((stamped) =>
            stamped.every(({ path, stamp }) => samePathStamp(packages.stamp(path), stamp)),
        );
    }

    /**
     * Where the request leads now. Node's answer stands unless it lies in a
     * folder the requested package name led to before, as its cache can hold
     * after a pnpm update: then the same file in the current folder, or a
     * refusal, as running the old folder would run code the update replaced.
     */
    private currentResolution(request: string, scopedRequire: NodeRequire): ResolvedRequest {
        let resolved: string;
        try {
            resolved = scopedRequire.resolve(request);
        } catch (miss) {
            const lookup = isNotFound(miss) ? this.requestedPackageDir(request) : undefined;
            const current = lookup && this.resolvedInCurrentFolder(request, lookup, scopedRequire);
            if (current === undefined) {
                throw miss;
            }
            return current;
        }
        const path = toWorkspacePath(resolved);
        const lookup = isRootedPath(path) ? this.requestedPackageDir(request) : undefined;
        const current = lookup && currentResolutionOf(path, request, lookup);
        if (lookup === undefined || current === undefined || current.kind === "keep") {
            return { file: resolved, lookup };
        }
        let moved: ResolvedRequest | undefined;
        if (current.kind === "redirect") {
            this.evictStaleRoot(current.staleRoot, scopedRequire.cache);
            const exists = this.options.sources.packages.realPath(current.file) !== undefined;
            moved = exists ? { file: fileSystemPathOf(current.file), lookup } : undefined;
        } else {
            moved = this.resolvedInCurrentFolder(request, lookup, scopedRequire);
        }
        if (moved === undefined) {
            this.refused.set(path, { kind: "module", file: path, reason: "movedByUpdate" });
            throw notAllowed(request);
        }
        this.refused.delete(path);
        return moved;
    }

    /** What Node's cached link target cannot answer: a file only the current folder holds, or one its `exports` now name. */
    private resolvedInCurrentFolder(
        request: string,
        lookup: PackageLookup,
        scopedRequire: NodeRequire,
    ): ResolvedRequest | undefined {
        const manifest = this.options.sources.packages.readTextFile(
            manifestPathOf(lookup.currentRoot),
        );
        const target = currentFolderRequestOf(
            request,
            lookup,
            manifest === undefined ? undefined : packageManifestOf(manifest),
        );
        if (target === undefined) {
            return undefined;
        }
        try {
            const file =
                target.kind === "file"
                    ? scopedRequire.resolve(fileSystemPathOf(target.file))
                    : this.options
                          .requireFrom(fileSystemPathOf(lookup.currentRoot))
                          .resolve(target.request);
            return isWithinRoot(toWorkspacePath(file), lookup.currentRoot)
                ? { file, lookup }
                : undefined;
        } catch {
            return undefined;
        }
    }

    private admit(
        resolved: string,
        request: string,
        lookup: PackageLookup | undefined,
        cache: ModuleCache,
    ): void {
        const requestsSelfPackage = this.requestsSelfPackage();
        const root = this.rootOfResolved(toWorkspacePath(resolved), requestsSelfPackage, lookup);
        if (root.kind === "module") {
            this.refused.set(root.file, root);
            throw notAllowed(request);
        }
        if (this.admitted.has(root.id)) {
            return;
        }
        const { sources, approvals } = this.options;
        const allowance = this.allowanceOf(root.id);
        const declined = sources.declinedThisSession?.() ?? NO_DECLINES;
        const state = allowanceStateOf({ id: root.id, allowance }, approvals, declined);
        if (state === "allowed") {
            const lookupDir = lookup?.currentRoot === root.id ? lookup.lookupDir : undefined;
            this.admitted.set(
                root.id,
                rootStampPathsOf(root.id, lookupDir).map((path) => ({
                    path,
                    stamp: sources.packages.stamp(path),
                })),
            );
            this.evictIfUpdated(root.id, cache);
            this.blocked.delete(root.id);
            this.refused.delete(root.id);
            return;
        }
        const manifest = sources.packages.readTextFile(manifestPathOf(root.id));
        this.blocked.set(root.id, {
            ...rulePackageOf(root.id, manifest, allowance),
            kind: root.kind,
            state,
        });
        this.request?.blocked.add(root.id);
        throw notAllowed(request);
    }

    private allowanceOf(rootId: string): Allowance {
        let allowance = this.allowanceByRoot.get(rootId);
        if (allowance === undefined) {
            allowance = this.options.sources.allowances.allowanceAt("rulePackage", rootId);
            this.allowanceByRoot.set(rootId, allowance);
        }
        return allowance;
    }

    /** Modules loaded under an older manifest stay cached under the same paths until dropped. */
    private evictIfUpdated(rootId: string, cache: ModuleCache): void {
        const { packages } = this.options.sources;
        const loaded = this.options.loadedManifestStamps;
        const before = loaded.get(rootId);
        const now = packages.stamp(manifestPathOf(rootId));
        loaded.set(rootId, now);
        if (before !== undefined && !samePathStamp(before, now)) {
            dropCachedWithin(evictionScopeOf(rootId), cache);
        }
    }

    /**
     * Nothing requires the old folder again, so its modules would stay cached
     * for the whole process, one version per update. Only the root: its
     * dependencies are links into other store folders the new version may share.
     */
    private evictStaleRoot(staleRoot: string, cache: ModuleCache): void {
        if (!this.evictedStaleRoots.has(staleRoot)) {
            this.evictedStaleRoots.add(staleRoot);
            dropCachedWithin(staleRoot, cache);
        }
    }

    private requestsSelfPackage(): boolean {
        const pkg = this.request?.pkg;
        return pkg !== undefined && pkg === this.selfPackageName;
    }

    private rootOfResolved(
        path: string,
        requestsSelfPackage: boolean,
        lookup: PackageLookup | undefined,
    ): AllowableRoot | RefusedModule {
        const file = this.options.sources.packages.realPath(path);
        if (file === undefined) {
            return { kind: "module", file: path, reason: "noPackageFolder" };
        }
        return approvalRootOf({
            file,
            configDir: this.realConfigDir,
            requestsSelfPackage,
            requestedPackageDir: lookup?.currentRoot,
        });
    }

    /**
     * A path request is a package's own file, such as a rule its `rules` map
     * names, so it belongs to the folder the requested package name leads to.
     */
    private requestedPackageDir(request: string): PackageLookup | undefined {
        const pkg = this.requestsSelfPackage() ? undefined : this.request?.pkg;
        const name =
            requestedPackageNameOf(request) ??
            (pkg === undefined ? undefined : requestedPackageNameOf(pkg));
        if (name === undefined) {
            return undefined;
        }
        for (const { packageDir } of dependencyCandidates(this.options.configDir, name)) {
            const { packages } = this.options.sources;
            const currentRoot = packages.realPath(packageDir);
            if (currentRoot !== undefined) {
                const linked = packages.entryKindOf(packageDir) === "symbolicLink";
                return { name, lookupDir: packageDir, currentRoot, linked };
            }
        }
        return undefined;
    }
}

function dropCachedWithin(scope: string, cache: ModuleCache): void {
    for (const path of Object.keys(cache)) {
        if (isWithinRoot(toWorkspacePath(path), scope)) {
            delete cache[path];
        }
    }
}

const NOT_FOUND_CODES: ReadonlySet<unknown> = new Set(["MODULE_NOT_FOUND", "ENOENT"]);

/** Node fails a cached link target with `ENOENT`, Bun with `MODULE_NOT_FOUND`; an `exports` refusal stands. */
function isNotFound(error: unknown): boolean {
    return NOT_FOUND_CODES.has((error as { code?: unknown } | undefined)?.code);
}

function notAllowed(request: string): Error {
    return Object.assign(new Error(`${request} is no allowed workspace rule package`), {
        code: "MODULE_NOT_FOUND",
    });
}
