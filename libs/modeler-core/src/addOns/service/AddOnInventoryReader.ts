import {
    declinedKeys,
    ListedPresence,
    needsContentHash,
    presenceIdOf,
} from "../../kernel/domain/codeApproval";
import { PluginApprovalStorePort } from "../../kernel/port/approvalPorts";
import { SettingsPort, WorkspacePort } from "../../kernel/port/hostPorts";
import { AddOnFacts, OwnedPresence } from "../domain/addOnCatalog";
import { innermostFolderOf } from "../domain/addOnPaths";
import { PluginAddOnSource, RulePackageAddOnSource } from "../port/addOnSourcePorts";

export interface AddOnInventoryPorts {
    readonly workspace: WorkspacePort;
    readonly settings: SettingsPort;
    readonly approvals: PluginApprovalStorePort;
    readonly plugins: PluginAddOnSource;
    readonly rulePackages?: RulePackageAddOnSource;
}

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
    }: Omit<AddOnFacts, "plugins" | "rulePackages">): Promise<OwnedPresence[]> {
        const { plugins } = this.ports;
        const inFolder = (path: string) => innermostFolderOf(path, folders) !== undefined;
        const listed = [
            ...(await plugins.pluginsIn([
                ...folders.map((root) => plugins.pluginsDirOf(root, configFolder)),
                ...plugins.knownPluginDirs().filter(inFolder),
            ])),
        ];
        const listedIds = new Set(listed.map(presenceIdOf));
        for (const { pluginId } of approvals.filter((row) => plugins.ownsApproval(row))) {
            if (inFolder(pluginId) && !listedIds.has(pluginId)) {
                listedIds.add(pluginId);
                listed.push(await plugins.current(pluginId));
            }
        }
        return listed.map((presence) => ({
            presence,
            sourceDir: plugins.configFolderOf(presenceIdOf(presence)),
            texts: plugins.texts,
        }));
    }

    private rulePackages(
        { folders, approvals }: Omit<AddOnFacts, "plugins" | "rulePackages">,
        inspected: ReadonlySet<string>,
    ): OwnedPresence[] {
        const { rulePackages } = this.ports;
        if (rulePackages === undefined) {
            return [];
        }
        const inFolder = (path: string) => innermostFolderOf(path, folders) !== undefined;
        const ids = new Set(
            [
                ...rulePackages.installedIn([
                    ...folders,
                    ...rulePackages.lintConfigDirs().filter(inFolder),
                ]),
                ...rulePackages.seenPackageIds(),
                ...approvals
                    .filter((row) => rulePackages.ownsApproval(row))
                    .map(({ pluginId }) => pluginId),
            ].filter(inFolder),
        );
        const declined = declinedKeys(rulePackages.sessionAnswers());
        return [...ids].map((id) => ({
            presence: rulePackages.currentRulePackage(id, {
                hash: inspected.has(id) || needsContentHash(id, approvals, declined),
            }),
            sourceDir: rulePackages.sourceDirOf(id),
            texts: rulePackages.texts,
        }));
    }
}
