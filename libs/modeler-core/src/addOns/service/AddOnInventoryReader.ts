import { declinedKeys, presenceIdOf } from "../../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { SettingsPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { AddOnFacts, OwnedPresence } from "../domain/addOnCatalog";
import {
    isHashWanted,
    missedRowIds,
    pluginDirsToList,
    rulePackageDirsToList,
    rulePackageIdsToList,
} from "../domain/addOnScope";
import { PluginAddOnSource, RulePackageAddOnSource } from "../port/addOnSourcePorts";

export interface AddOnInventoryPorts {
    readonly workspace: WorkspacePort;
    readonly settings: SettingsPort;
    readonly approvals: PluginApprovalStorePort;
    readonly plugins: PluginAddOnSource;
    readonly rulePackages?: RulePackageAddOnSource;
}

type ListingFacts = Omit<AddOnFacts, "plugins" | "rulePackages">;

/** Collects what the owners find in the open workspace folders, and the rows they missed there. */
export class AddOnInventoryReader {
    constructor(private readonly ports: AddOnInventoryPorts) {}

    /** @param inspected Rule packages the user asked to read, hashed though no row asks for it. */
    async read(inspected: ReadonlySet<string>): Promise<AddOnFacts> {
        // From the host, so a mirror not yet seeded never makes every row look new.
        const approvals = await this.ports.approvals.readStored();
        const folders = this.ports.workspace.getWorkspaceFolderPaths();
        const configFolder = this.ports.settings.getConfigFolder();
        const facts = { folders, configFolder, approvals };
        return {
            ...facts,
            plugins: await this.plugins(facts),
            rulePackages: this.rulePackages(facts, inspected),
        };
    }

    private async plugins({
        folders,
        configFolder,
        approvals,
    }: ListingFacts): Promise<OwnedPresence[]> {
        const { plugins } = this.ports;
        const listed = [
            ...(await plugins.pluginsIn(
                pluginDirsToList({
                    folders,
                    rootPluginDirs: folders.map((root) => plugins.pluginsDirOf(root, configFolder)),
                    knownPluginDirs: plugins.knownPluginDirs(),
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
        const ids = rulePackageIdsToList(folders, {
            installed: rulePackages.installedIn(
                rulePackageDirsToList(folders, rulePackages.lintConfigDirs()),
            ),
            seen: rulePackages.seenPackageIds(),
            ownedRowIds: approvals
                .filter((row) => rulePackages.ownsApproval(row))
                .map(({ pluginId }) => pluginId),
        });
        const hashContext = {
            inspected,
            approvals,
            declined: declinedKeys(rulePackages.sessionAnswers()),
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
