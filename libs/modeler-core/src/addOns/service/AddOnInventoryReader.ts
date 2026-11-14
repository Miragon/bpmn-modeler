import { approvalRowsOf } from "../../kernel/domain/approvalRowKind";
import { unwatchedDirsGlob } from "../../kernel/domain/excludedDirs";
import { presenceIdOf } from "../../kernel/domain/listedCode";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { FolderTemplateFileListing } from "../../kernel/domain/templateListing";
import { SettingsPort, WorkspacePort, WorkspaceTrustPort } from "../../kernel/port/hostPorts";
import { TemplatePreferenceStorePort } from "../../kernel/port/templatePreferencePorts";
import { AddOnFacts } from "../domain/addOnCatalog";
import { OwnedPresence } from "../domain/codeAddOnCatalog";
import { ListedMarketplace, ListedMarketplaces } from "../domain/templateAddOnViews";
import {
    configAreaDirsToList,
    configFolderFilesGlob,
    configFolderHoldersIn,
    rulePackageDirsToList,
    rulePackageIdsToList,
} from "../domain/addOnScope";
import {
    MarketplaceAddOnSource,
    PluginAddOnSource,
    RulePackageAddOnSource,
    TemplateAddOnSource,
} from "../port/addOnSourcePorts";

export interface AddOnInventoryPorts {
    readonly workspace: WorkspacePort;
    readonly settings: SettingsPort;
    readonly approvals: PluginApprovalStorePort;
    readonly plugins: PluginAddOnSource;
    readonly rulePackages?: RulePackageAddOnSource;
    readonly templates?: TemplateAddOnSource;
    readonly marketplaces?: MarketplaceAddOnSource;
    readonly templatePreferences?: TemplatePreferenceStorePort;
    readonly workspaceTrust: Pick<WorkspaceTrustPort, "isTrusted">;
}

interface ListingFacts extends Pick<AddOnFacts, "folders" | "configFolder"> {
    /** Each workspace folder and each folder below one that holds a config folder. */
    readonly holders: readonly string[];
    /** The folders of the lint configs a search found. */
    readonly foundLintConfigDirs: readonly string[];
}

/** Collects what the owners find in the open workspace folders, nested projects included. */
export class AddOnInventoryReader {
    constructor(private readonly ports: AddOnInventoryPorts) {}

    async read(): Promise<AddOnFacts> {
        // From the host, so a mirror not yet seeded never makes every row look new.
        const approvals = await this.ports.approvals.readStored();
        const approvalsByKind = {
            plugin: approvalRowsOf("plugin", approvals),
            rulePackage: approvalRowsOf("rulePackage", approvals),
        };
        const templatePreferences = await this.ports.templatePreferences?.readStored();
        const folders = this.ports.workspace.getWorkspaceFolderPaths();
        const configFolder = this.ports.settings.getConfigFolder();
        const facts = { folders, configFolder, ...(await this.places(folders, configFolder)) };
        return {
            folders,
            configFolder,
            trusted: this.ports.workspaceTrust.isTrusted(),
            approvalsByKind,
            plugins: await this.plugins(facts),
            rulePackages: this.rulePackages(facts),
            templates: await this.templates(facts),
            ...(await this.marketplaces()),
            ...(templatePreferences && { templatePreferences }),
        };
    }

    /** Searched on every build, so a project added below a workspace folder is listed without an editor opening there. */
    private async places(
        folders: readonly string[],
        configFolder: string,
    ): Promise<Pick<ListingFacts, "holders" | "foundLintConfigDirs">> {
        if (folders.length === 0) {
            return { holders: [], foundLintConfigDirs: [] };
        }
        const { workspace, rulePackages } = this.ports;
        const exclude = unwatchedDirsGlob();
        const [configFiles, lintConfigs] = await Promise.all([
            workspace.findFiles(configFolderFilesGlob(configFolder), exclude),
            rulePackages ? workspace.findFiles(rulePackages.lintConfigFiles, exclude) : [],
        ]);
        return {
            holders: configFolderHoldersIn(configFiles, folders, configFolder),
            foundLintConfigDirs: lintConfigs.flatMap(
                (path) => rulePackages?.lintConfigDirOf(path) ?? [],
            ),
        };
    }

    private async templates({
        folders,
        configFolder,
        holders,
    }: ListingFacts): Promise<readonly FolderTemplateFileListing[]> {
        const { templates } = this.ports;
        if (templates === undefined) {
            return [];
        }
        return templates.templatesIn(
            configAreaDirsToList({
                folders,
                holderDirs: holders.map((dir) => templates.templatesDirOf(dir, configFolder)),
                knownDirs: templates.knownTemplateDirs(),
            }),
        );
    }

    private async marketplaces(): Promise<{ readonly marketplaces?: ListedMarketplaces }> {
        const { marketplaces, templates } = this.ports;
        if (marketplaces === undefined) {
            return {};
        }
        const listing = await marketplaces.listMarketplaces();
        if (listing.kind === "unreadable") {
            return { marketplaces: listing };
        }
        const sources: ListedMarketplace[] = [];
        for (const { templateFiles, ...marketplace } of listing.sources) {
            sources.push({
                ...marketplace,
                templates: (await templates?.templatesOf(templateFiles)) ?? [],
            });
        }
        return { marketplaces: { kind: "listed", sources } };
    }

    private async plugins({
        folders,
        configFolder,
        holders,
    }: ListingFacts): Promise<OwnedPresence[]> {
        const { plugins } = this.ports;
        const listed = await plugins.pluginsIn(
            configAreaDirsToList({
                folders,
                holderDirs: holders.map((dir) => plugins.pluginsDirOf(dir, configFolder)),
                knownDirs: plugins.knownPluginDirs(),
            }),
        );
        return listed.map((presence) => ({
            presence,
            sourceDir: plugins.configFolderOf(presenceIdOf(presence)),
            texts: plugins.texts,
        }));
    }

    private rulePackages({ folders, foundLintConfigDirs }: ListingFacts): OwnedPresence[] {
        const { rulePackages } = this.ports;
        if (rulePackages === undefined) {
            return [];
        }
        const ids = rulePackageIdsToList(folders, {
            installed: rulePackages.installedIn(
                rulePackageDirsToList(folders, [
                    ...rulePackages.lintConfigDirs(),
                    ...foundLintConfigDirs,
                ]),
            ),
            seen: rulePackages.seenPackageIds(),
        });
        return ids.map((id) => ({
            presence: rulePackages.currentRulePackage(id),
            sourceDir: rulePackages.sourceDirOf(id),
            texts: rulePackages.texts,
        }));
    }
}
