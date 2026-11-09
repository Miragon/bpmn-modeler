import {
    ApprovableArtifact,
    CodeApproval,
    ListedPresence,
    SessionAnswer,
} from "../../../kernel/domain/codeApproval";
import { joinWorkspacePath } from "../../../kernel/domain/workspacePath";
import {
    InstalledEntry,
    rulePackageFolderNames,
    rulePackageScopesToList,
} from "../domain/packageClosure";
import {
    installedPackageNameOf,
    installedPackagesDirOf,
    isRulePackageApproval,
    nodeModulesDirOf,
    RULE_PACKAGE_CODE_TEXTS,
    rootKindOf,
} from "../domain/rulePackageApproval";
import {
    closureRefusalText,
    ROOT_KIND_UNKNOWN_TEXT,
    ruleModuleRefusalText,
} from "../domain/rulePackageLog";
import { InstalledPackagesPort } from "../port/installedPackagesPort";
import { PackageClosureFingerprinter } from "./PackageClosureFingerprinter";
import { RulePackageCatalog } from "./RulePackageCatalog";

/**
 * The workspace rule packages as the add-on catalog lists them: installed or
 * reported by the gate, hashed only when asked, and answered for by the
 * catalog the lint questions use.
 */
export class RulePackageInventory {
    readonly texts = RULE_PACKAGE_CODE_TEXTS;

    /** Real folders a `node_modules` entry linked to, so a linked folder hashes as a package. */
    private readonly linkedFolders = new Set<string>();

    constructor(
        private readonly catalog: RulePackageCatalog,
        private readonly fingerprints: Pick<PackageClosureFingerprinter, "fingerprint">,
        private readonly packages: InstalledPackagesPort,
    ) {}

    /**
     * The rule packages installed in each folder's `node_modules`, by real
     * folder, so a linked one names the folder its approval is for.
     */
    installedIn(dirs: readonly string[]): readonly string[] {
        const found = new Set<string>();
        for (const nodeModules of new Set(dirs.map(nodeModulesDirOf))) {
            for (const name of this.ruleFolderNamesIn(nodeModules)) {
                const realPath = this.packages.realPath(joinWorkspacePath(nodeModules, name));
                if (realPath !== undefined) {
                    found.add(realPath);
                    this.linkedFolders.add(realPath);
                }
            }
        }
        return [...found];
    }

    ownsApproval(approval: CodeApproval): boolean {
        return isRulePackageApproval(approval);
    }

    seenPackageIds(): readonly string[] {
        return this.catalog.seenPackages().map(({ id }) => id);
    }

    lintConfigDirs(): readonly string[] {
        return this.catalog.lintConfigDirs();
    }

    currentRulePackage(id: string, { hash }: { readonly hash: boolean }): ListedPresence {
        const name = installedPackageNameOf(id);
        if (this.packages.realPath(id) === undefined) {
            return { kind: "gone", id, name };
        }
        if (!hash) {
            return { kind: "unhashed", id, name };
        }
        const root = this.rootOf(id);
        if (root === undefined) {
            return { kind: "unreadable", id, name, reason: ROOT_KIND_UNKNOWN_TEXT };
        }
        if (root.kind === "refused") {
            return { kind: "unreadable", id, name, reason: ruleModuleRefusalText(root.reason) };
        }
        const fingerprint = this.fingerprints.fingerprint(root);
        if (fingerprint.kind === "refused") {
            return {
                kind: "unreadable",
                id,
                name,
                reason: closureRefusalText({ id, ...fingerprint }),
            };
        }
        const { rulePackage, memberDirs } = fingerprint;
        return {
            kind: "found",
            artifact: { ...rulePackage, files: memberDirs },
            name: rulePackage.name,
        };
    }

    /** The `node_modules` a package is installed in, or its own folder when it is installed elsewhere. */
    sourceDirOf(id: string): string {
        return installedPackagesDirOf(id) ?? id;
    }

    async current(id: string): Promise<ListedPresence> {
        return this.currentRulePackage(id, { hash: true });
    }

    /** Code a revoked package already ran stays loaded; nothing else to undo. */
    afterRevoke(): Promise<void> {
        return Promise.resolve();
    }

    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.catalog.sessionAnswers();
    }

    revokedThisSession(): ReadonlySet<string> {
        return this.catalog.revokedThisSession();
    }

    leaveForView(artifact: ApprovableArtifact): void {
        this.catalog.leaveForView(artifact);
    }

    onDidChange(listener: () => void): { dispose(): void } {
        return this.catalog.onDidChangeListing(listener);
    }

    /** The gate's config folder is a real path, so each read config folder is compared as one. */
    private rootOf(id: string) {
        return rootKindOf(id, {
            reported: this.catalog.seenPackages().find((each) => each.id === id)?.kind,
            realConfigDirs: this.catalog
                .lintConfigDirs()
                .map((dir) => this.packages.realPath(dir) ?? dir),
            linkedFromNodeModules: this.linkedFolders.has(id),
        });
    }

    private ruleFolderNamesIn(nodeModules: string): string[] {
        const entries: readonly InstalledEntry[] = this.packages.listDirectory(nodeModules) ?? [];
        const scoped = new Map(
            rulePackageScopesToList(entries).map((scope) => [
                scope,
                this.packages.listDirectory(joinWorkspacePath(nodeModules, scope)) ?? [],
            ]),
        );
        return rulePackageFolderNames(entries, scoped);
    }
}
