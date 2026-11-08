import { CodeApproval } from "../../../../../kernel/domain/codeApproval";
import { isWithinRoot } from "../../../../../kernel/domain/rootContainment";
import { joinWorkspacePath, toWorkspacePath } from "../../../../../kernel/domain/workspacePath";
import { PluginApprovalStorePort } from "../../../../../kernel/port/approvalPorts";
import {
    ClosureFingerprint,
    ClosureStamp,
    dependencyCandidates,
    FingerprintedRoot,
    packageManifestOf,
} from "../../../domain/packageClosure";
import {
    BlockedRulePackage,
    BlockedState,
    loadsWithoutApproval,
    requestedPackageNameOf,
    RulePackageVerdict,
    rulePackageVerdict,
} from "../../../domain/rulePackageApproval";
import {
    approvalRootOf,
    RefusedModule,
    RefusedRuleModule,
} from "../../../domain/rulePackageRefusal";
import { InstalledPackagesPort } from "../../../port/installedPackagesPort";
import { RequestAttribution } from "./CompositeResolver";

/** What the gate needs of `PackageClosureFingerprinter`. */
export interface ClosureFingerprints {
    fingerprint(root: FingerprintedRoot): ClosureFingerprint;
    isUnchanged(stamps: readonly ClosureStamp[]): boolean;
}

/** What a host wires so that the workspace rule packages the user allowed run. */
export interface RulePackageSources {
    readonly approvals: Pick<PluginApprovalStorePort, "read">;
    readonly fingerprints: ClosureFingerprints;
    readonly packages: InstalledPackagesPort;
    /** `declineKeyOf` of each rule package the user declined this session. */
    readonly declinedThisSession?: () => ReadonlySet<string>;
}

export interface RulePackageGateOptions {
    readonly sources: RulePackageSources;
    /** The rows the lint setup was built for; other rows build another setup. */
    readonly approvals: readonly CodeApproval[];
    /** The `.bpmnlintrc` folder the scoped require looks up from, spelled like `toWorkspacePath`. */
    readonly configDir: string;
    /** The closure hash each member folder was last admitted under, kept across setups. */
    readonly loadedContentHashes: Map<string, string>;
}

type ModuleCache = NodeRequire["cache"];

const NO_DECLINES: ReadonlySet<string> = new Set();

/**
 * Lets a workspace rule package run only while the user's approval matches
 * its content. It wraps the scoped require NodeResolver loads packages with,
 * so it decides before any of their code runs: synchronously, as `require`
 * cannot wait, and without module loader hooks, which Bun does not fire.
 * One gate serves one lint setup.
 *
 * A package's own `require` calls are Node's, not this gate's: what it loads
 * from its declared dependencies is in the approved hash, anything else it
 * loads is not.
 */
export class RulePackageGate implements RequestAttribution {
    private readonly admittedMembers = new Set<string>();
    private readonly admittedStamps: ClosureStamp[] = [];
    private readonly blocked = new Map<
        string,
        { readonly kind: FingerprintedRoot["kind"]; readonly state: BlockedState }
    >();
    /** By the refused file, or by the root of a closure that could not be fingerprinted. */
    private readonly refused = new Map<string, RefusedRuleModule>();
    private request: { readonly pkg: string; readonly blocked: Set<string> } | undefined;
    private readonly realConfigDir: string;
    private readonly selfPackageName: string | undefined;

    constructor(private readonly options: RulePackageGateOptions) {
        const { packages } = options.sources;
        this.realConfigDir = packages.realPath(options.configDir) ?? options.configDir;
        const manifest = packages.readTextFile(
            joinWorkspacePath(this.realConfigDir, "package.json"),
        );
        this.selfPackageName = packageManifestOf(manifest ?? "")?.name;
    }

    require(scopedRequire: NodeRequire): NodeRequire {
        const gated = (request: string): unknown => {
            const resolved = scopedRequire.resolve(request);
            if (!loadsWithoutApproval(toWorkspacePath(resolved))) {
                this.admit(resolved, request, scopedRequire.cache);
            }
            return scopedRequire(resolved);
        };
        return Object.assign(gated, { resolve: scopedRequire.resolve }) as unknown as NodeRequire;
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
        return [...this.blocked].map(([id, { kind, state }]) => ({
            id,
            kind,
            state,
            needed: needed.has(id),
        }));
    }

    /** Stats only, so the linter can ask before every run. */
    isUnchanged(): boolean {
        return this.options.sources.fingerprints.isUnchanged(this.admittedStamps);
    }

    private admit(resolved: string, request: string, cache: ModuleCache): void {
        const root = this.rootOfResolved(toWorkspacePath(resolved), request);
        if (root.kind === "module") {
            this.refused.set(root.file, root);
            throw notAllowed(request);
        }
        const verdict = this.verdictFor(root, cache);
        if (verdict.kind === "admitted") {
            this.blocked.delete(root.id);
            this.refused.delete(root.id);
            return;
        }
        if (verdict.kind === "blocked") {
            this.blocked.set(root.id, { kind: root.kind, state: verdict.state });
            this.request?.blocked.add(root.id);
        } else if (verdict.kind === "refused") {
            this.refused.set(root.id, verdict.refusal);
        }
        throw notAllowed(request);
    }

    private rootOfResolved(path: string, request: string): FingerprintedRoot | RefusedModule {
        const file = this.options.sources.packages.realPath(path);
        if (file === undefined) {
            return { kind: "module", file: path, reason: "noPackageFolder" };
        }
        const pkg = this.request?.pkg;
        const requestsSelfPackage = pkg !== undefined && pkg === this.selfPackageName;
        return approvalRootOf({
            file,
            configDir: this.realConfigDir,
            requestsSelfPackage,
            requestedPackageDir: this.requestedPackageDir(request, requestsSelfPackage),
        });
    }

    /**
     * A path request is a package's own file, such as a rule its `rules` map
     * names, so it belongs to the folder the requested package name leads to.
     */
    private requestedPackageDir(request: string, requestsSelfPackage: boolean): string | undefined {
        const pkg = requestsSelfPackage ? undefined : this.request?.pkg;
        const name =
            requestedPackageNameOf(request) ??
            (pkg === undefined ? undefined : requestedPackageNameOf(pkg));
        if (name === undefined) {
            return undefined;
        }
        for (const { packageDir } of dependencyCandidates(this.options.configDir, name)) {
            const linked = this.options.sources.packages.realPath(packageDir);
            if (linked !== undefined) {
                return linked;
            }
        }
        return undefined;
    }

    private verdictFor(
        root: FingerprintedRoot,
        cache: ModuleCache,
    ): RulePackageVerdict | { readonly kind: "refused"; readonly refusal: RefusedRuleModule } {
        const { sources, approvals } = this.options;
        const context = {
            approvals,
            admittedMembers: this.admittedMembers,
            declinedThisSession: sources.declinedThisSession?.() ?? NO_DECLINES,
        };
        const verdict = rulePackageVerdict(root.id, context);
        if (verdict.kind !== "hashNeeded") {
            return verdict;
        }
        const fingerprint = sources.fingerprints.fingerprint(root);
        if (fingerprint.kind === "refused") {
            const { reason, memberDir } = fingerprint;
            return { kind: "refused", refusal: { kind: "closure", id: root.id, memberDir, reason } };
        }
        const hashed = rulePackageVerdict(root.id, context, fingerprint.rulePackage.contentHash);
        if (hashed.kind === "admitted") {
            this.admitClosure(fingerprint, cache);
        }
        return hashed;
    }

    /** Modules loaded from older content stay cached under the same paths until dropped. */
    private admitClosure(
        { rulePackage, memberDirs, stamps }: Extract<ClosureFingerprint, { kind: "fingerprinted" }>,
        cache: ModuleCache,
    ): void {
        memberDirs.forEach((dir) => this.admittedMembers.add(dir));
        this.admittedStamps.push(...stamps);
        const loaded = this.options.loadedContentHashes;
        // By member: a package first loaded as another's dependency may be admitted on its own later.
        const reloaded = memberDirs.filter((dir) => {
            const before = loaded.get(dir);
            loaded.set(dir, rulePackage.contentHash);
            return before !== undefined && before !== rulePackage.contentHash;
        });
        for (const path of Object.keys(cache)) {
            const modulePath = toWorkspacePath(path);
            if (reloaded.some((dir) => isWithinRoot(modulePath, dir))) {
                delete cache[path];
            }
        }
    }
}

function notAllowed(request: string): Error {
    return Object.assign(new Error(`${request} is no allowed workspace rule package`), {
        code: "MODULE_NOT_FOUND",
    });
}
