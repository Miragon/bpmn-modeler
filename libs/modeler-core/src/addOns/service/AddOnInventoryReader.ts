import { presenceIdOf } from "../../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { FolderTemplateFileListing } from "../../kernel/domain/templateListing";
import { SettingsPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { TemplatePreferenceStorePort } from "../../kernel/port/templatePreferencePorts";
import { AddOnFacts } from "../domain/addOnCatalog";
import { OwnedPresence } from "../domain/codeAddOnCatalog";
import { ListedMarketplace, ListedMarketplaces } from "../domain/templateAddOnViews";
import {
    configAreaDirsToList,
    isHashWanted,
    missedRowIds,
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
}

type ListingFacts = Pick<AddOnFacts, "folders" | "configFolder" | "approvals">;

/** Collects what the owners find in the open workspace folders, and the rows they missed there. */
export class AddOnInventoryReader {
    constructor(private readonly ports: AddOnInventoryPorts) {}

    /** @param inspected Rule packages the user asked to read, hashed though no row asks for it. */
    async read(inspected: ReadonlySet<string>): Promise<AddOnFacts> {
        // From the host, so a mirror not yet seeded never makes every row look new.
        const approvals = await this.ports.approvals.readStored();
        const templatePreferences = await this.ports.templatePreferences?.readStored();
        const folders = this.ports.workspace.getWorkspaceFolderPaths();
        const configFolder = this.ports.settings.getConfigFolder();
        const facts = { folders, configFolder, approvals };
        return {
            ...facts,
            plugins: await this.plugins(facts),
            rulePackages: this.rulePackages(facts, inspected),
            templates: await this.templates(facts),
            ...(await this.marketplaces()),
            ...(templatePreferences && { templatePreferences }),
        };
    }

    private async templates({
        folders,
        configFolder,
    }: ListingFacts): Promise<readonly FolderTemplateFileListing[]> {
        const { templates } = this.ports;
        if (templates === undefined) {
            return [];
        }
        return templates.templatesIn(
            configAreaDirsToList({
                folders,
                rootDirs: folders.map((root) => templates.templatesDirOf(root, configFolder)),
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
        approvals,
    }: ListingFacts): Promise<OwnedPresence[]> {
        const { plugins } = this.ports;
        const listed = [
            ...(await plugins.pluginsIn(
                configAreaDirsToList({
                    folders,
                    rootDirs: folders.map((root) => plugins.pluginsDirOf(root, configFolder)),
                    knownDirs: plugins.knownPluginDirs(),
                }),
            )),
        ];
        const ownedRowIds = approvals
            .filter((row) => plugins.ownsApproval(row))
            .map(({ pluginId }) => pluginId);
        for (const id of missedRowIds(ownedRowIds, listed.map(presenceIdOf), folders)) {
            listed.push(await plugins.current(id));
        }
        return listed.map((presence) => ({
            presence,
            sourceDir: plugins.configFolderOf(presenceIdOf(presence)),
            texts: plugins.texts,
        }));
    }

    private rulePackages(
        { folders, approvals }: ListingFacts,
        inspected: ReadonlySet<string>,
    ): OwnedPresence[] {
        const { rulePackages } = this.ports;
        if (rulePackages === undefined) {
            return [];
        }
        const ownedRows = approvals.filter((row) => rulePackages.ownsApproval(row));
        const ids = rulePackageIdsToList(folders, {
            installed: rulePackages.installedIn(
                rulePackageDirsToList(folders, rulePackages.lintConfigDirs()),
            ),
            seen: rulePackages.seenPackageIds(),
            ownedRowIds: ownedRows.map(({ pluginId }) => pluginId),
        });
        const hashContext = {
            inspected,
            approvals: ownedRows,
            answers: rulePackages.sessionAnswers(),
        };
        return ids.map((id) => ({
            presence: rulePackages.currentRulePackage(id, {
                hash: isHashWanted(id, hashContext),
            }),
            sourceDir: rulePackages.sourceDirOf(id),
            texts: rulePackages.texts,
        }));
    }
}
