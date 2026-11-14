import { unwatchedDirsGlob } from "../../kernel/domain/excludedDirs";
import { WorkspacePort } from "../../kernel/port/hostPorts";
import { configFolderFilesGlob, configFolderHoldersIn } from "../domain/addOnScope";
import { RulePackageAddOnSource } from "../port/addOnSourcePorts";

/** Where add-ons can sit in the open workspace, nested projects included. */
export interface AddOnPlaces {
    /** Each workspace folder and each folder below one that holds a config folder. */
    readonly holders: readonly string[];
    /** The folders of the lint configs found. */
    readonly lintConfigDirs: readonly string[];
}

const NO_PLACES: AddOnPlaces = { holders: [], lintConfigDirs: [] };

/**
 * Searches the workspace on every build, so a project below a workspace
 * folder is listed without an editor opening there. Leaves out the folders
 * a watcher ignores, as the watchers that trigger a build do.
 */
export class AddOnPlaceSearch {
    constructor(
        private readonly workspace: WorkspacePort,
        private readonly rulePackages:
            Pick<RulePackageAddOnSource, "lintConfigFiles" | "lintConfigDirOf"> | undefined,
    ) {}

    async find(folders: readonly string[], configFolder: string): Promise<AddOnPlaces> {
        if (folders.length === 0) {
            return NO_PLACES;
        }
        const { workspace, rulePackages } = this;
        const exclude = unwatchedDirsGlob();
        const [configFiles, lintConfigs] = await Promise.all([
            workspace.findFiles(configFolderFilesGlob(configFolder), exclude),
            rulePackages ? workspace.findFiles(rulePackages.lintConfigFiles, exclude) : [],
        ]);
        return {
            holders: configFolderHoldersIn(configFiles, folders, configFolder),
            lintConfigDirs: lintConfigs.flatMap(
                (path) => rulePackages?.lintConfigDirOf(path) ?? [],
            ),
        };
    }
}
