import { Allowance, allowanceStateOf } from "../../../../../kernel/domain/allowance";
import { AllowanceKind } from "../../../../../kernel/domain/approvalRowKind";
import { CodeApproval } from "../../../../../kernel/domain/codeApproval";
import { isWithinRoot } from "../../../../../kernel/domain/rootContainment";
import { toWorkspacePath } from "../../../../../kernel/domain/workspacePath";
import { PluginApprovalStorePort } from "../../../../../kernel/port/approvalPorts";
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
}

export interface RulePackageGateOptions {
    readonly sources: RulePackageSources;
    /** The rows the lint setup was built for; other rows build another setup. */
    readonly approvals: readonly CodeApproval[];
    /** The `.bpmnlintrc` folder the scoped require looks up from, spelled like `toWorkspacePath`. */
    readonly configDir: string;
    /** The root's package.json stamp it was last loaded under, kept across setups by NodeBpmnLinter. */
    readonly loadedManifestStamps: Map<string, PathStamp | undefined>;
}

interface StampedPath {
    readonly path: string;
    readonly stamp: PathStamp | undefined;
}

/** A package folder a bare name led to: the path looked up, and where its links end. */
interface PackageLookup {
    readonly lookupDir: string;
    readonly realDir: string;
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
    private request: { readonly pkg: string; readonly blocked: Set<string> } | undefined;
    private readonly realConfigDir: string;
    private readonly selfPackageName: string | undefined;

    constructor(private readonly options: RulePackageGateOptions) {
        const { packages } = options.sources;
        this.realConfigDir = packages.realPath(options.configDir) ?? options.configDir;
        const manifest = packages.readTextFile(manifestPathOf(this.realConfigDir));
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
        return [...this.blocked.values()].map((each) => ({ ...each, needed: needed.has(each.id) }));
    }

    /** Stats only, so the linter can ask before every run. */
    isUnchanged(): boolean {
        const { packages } = this.options.sources;
        return [...this.admitted.values()].every((stamped) =>
            stamped.every(({ path, stamp }) => samePathStamp(packages.stamp(path), stamp)),
        );
    }

    private admit(resolved: string, request: string, cache: ModuleCache): void {
        const requestsSelfPackage = this.requestsSelfPackage();
        const lookup = this.requestedPackageDir(request, requestsSelfPackage);
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
            const lookupDir = lookup?.realDir === root.id ? lookup.lookupDir : undefined;
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
        if (before === undefined || samePathStamp(before, now)) {
            return;
        }
        const scope = evictionScopeOf(rootId);
        for (const path of Object.keys(cache)) {
            if (isWithinRoot(toWorkspacePath(path), scope)) {
                delete cache[path];
            }
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
            requestedPackageDir: lookup?.realDir,
        });
    }

    /**
     * A path request is a package's own file, such as a rule its `rules` map
     * names, so it belongs to the folder the requested package name leads to.
     */
    private requestedPackageDir(
        request: string,
        requestsSelfPackage: boolean,
    ): PackageLookup | undefined {
        const pkg = requestsSelfPackage ? undefined : this.request?.pkg;
        const name =
            requestedPackageNameOf(request) ??
            (pkg === undefined ? undefined : requestedPackageNameOf(pkg));
        if (name === undefined) {
            return undefined;
        }
        for (const { packageDir } of dependencyCandidates(this.options.configDir, name)) {
            const realDir = this.options.sources.packages.realPath(packageDir);
            if (realDir !== undefined) {
                return { lookupDir: packageDir, realDir };
            }
        }
        return undefined;
    }
}

function notAllowed(request: string): Error {
    return Object.assign(new Error(`${request} is no allowed workspace rule package`), {
        code: "MODULE_NOT_FOUND",
    });
}
