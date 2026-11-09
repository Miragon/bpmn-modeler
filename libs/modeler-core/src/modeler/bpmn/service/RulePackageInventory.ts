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
import { installedPackageNameOf, isRulePackageApproval } from "../domain/rulePackageApproval";
import { closureRefusalText } from "../domain/rulePackageLog";
import { InstalledPackagesPort } from "../port/installedPackagesPort";
import { PackageClosureFingerprinter } from "./PackageClosureFingerprinter";
import { RulePackageCatalog } from "./RulePackageCatalog";

/**
 * The workspace rule packages as the add-on catalog lists them: installed or
 * reported by the gate, hashed only when asked, and answered for by the
 * catalog the lint questions use.
 */
export class RulePackageInventory {
    constructor(
        private readonly catalog: RulePackageCatalog,
        private readonly fingerprints: Pick<PackageClosureFingerprinter, "fingerprint">,
        private readonly packages: InstalledPackagesPort,
    ) {}

    /** Each rule package's real folder, so a linked one names the folder its approval is for. */
    installedIn(nodeModulesDirs: readonly string[]): readonly string[] {
        const found = new Set<string>();
        for (const nodeModules of new Set(nodeModulesDirs)) {
            for (const name of this.ruleFolderNamesIn(nodeModules)) {
                const realPath = this.packages.realPath(joinWorkspacePath(nodeModules, name));
                if (realPath !== undefined) found.add(realPath);
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
        const fingerprint = this.fingerprints.fingerprint({ id, kind: this.kindOf(id) });
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

    /** The config's own package hashes without its models, so only the gate's report can tell. */
    private kindOf(id: string) {
        return this.catalog.seenPackages().find((each) => each.id === id)?.kind ?? "package";
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
