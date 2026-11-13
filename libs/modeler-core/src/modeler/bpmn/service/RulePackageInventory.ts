import { AllowableCode } from "../../../kernel/domain/allowance";
import { SessionAnswer } from "../../../kernel/domain/approvalAnswer";
import {
    installedPackageNameOf,
    installedSourceDirOf,
    nodeModulesDirOf,
} from "../../../kernel/domain/installedPackagePath";
import { ListedPresence } from "../../../kernel/domain/listedCode";
import { joinWorkspacePath } from "../../../kernel/domain/workspacePath";
import { AllowanceLocator } from "../../../kernel/service/AllowanceLocator";
import {
    InstalledEntry,
    manifestPathOf,
    rulePackageFolderNames,
    rulePackageScopesToList,
} from "../domain/installedPackage";
import {
    RULE_PACKAGE_CODE_TEXTS,
    rootKindOf,
    rulePackageLabelOf,
    rulePackageOf,
} from "../domain/rulePackageApproval";
import { ROOT_KIND_UNKNOWN_TEXT, ruleModuleRefusalText } from "../domain/rulePackageLog";
import { InstalledPackagesPort } from "../port/installedPackagesPort";
import { RulePackageCatalog } from "./RulePackageCatalog";

/**
 * The workspace rule packages as the add-on catalog lists them: installed or
 * reported by the gate, named by their manifest, located at their allowance,
 * and answered for by the catalog the lint questions use.
 */
export class RulePackageInventory {
    readonly texts = RULE_PACKAGE_CODE_TEXTS;

    /** Real folders a `node_modules` entry linked to in the last listing, so a linked folder reads as a package. */
    private linkedFolders: ReadonlySet<string> = new Set();

    constructor(
        private readonly catalog: RulePackageCatalog,
        private readonly packages: InstalledPackagesPort,
        private readonly allowances: AllowanceLocator,
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
                }
            }
        }
        this.linkedFolders = found;
        return [...found];
    }

    seenPackageIds(): readonly string[] {
        return this.catalog.seenPackages().map(({ id }) => id);
    }

    lintConfigDirs(): readonly string[] {
        return this.catalog.lintConfigDirs();
    }

    currentRulePackage(id: string): ListedPresence {
        const name = installedPackageNameOf(id);
        if (this.packages.realPath(id) === undefined) {
            return { kind: "gone", id, name };
        }
        const allowance = this.allowances.allowanceAt("rulePackage", id);
        const root = this.rootOf(id);
        if (root === undefined) {
            return { kind: "unreadable", id, name, reason: ROOT_KIND_UNKNOWN_TEXT, allowance };
        }
        if (root.kind === "refused") {
            const reason = ruleModuleRefusalText(root.reason);
            return { kind: "unreadable", id, name, reason, allowance };
        }
        const manifest = this.packages.readTextFile(manifestPathOf(id));
        const artifact = rulePackageOf(id, manifest, allowance);
        return { kind: "found", artifact, name: rulePackageLabelOf(artifact) };
    }

    sourceDirOf(id: string): string {
        return installedSourceDirOf(id);
    }

    async current(id: string): Promise<ListedPresence> {
        return this.currentRulePackage(id);
    }

    sessionAnswers(): ReadonlyMap<string, SessionAnswer> {
        return this.catalog.sessionAnswers();
    }

    /** Code a revoked package already ran stays loaded until the process restarts. */
    stillLoadedAfterRevoke(): ReadonlySet<string> {
        return this.catalog.revokedThisSession();
    }

    leaveForView(code: AllowableCode): void {
        this.catalog.leaveForView(code);
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
