import { ancestorsUpTo } from "../../../kernel/domain/ancestorsUpTo";
import { configFolderPath } from "../../../kernel/domain/configArtifacts";
import { changesConfigLookup } from "../../../kernel/domain/configLookup";
import { DirectoryNotFound } from "../../../kernel/domain/errors";
import { SettingsPort, WorkspacePort } from "../../../kernel/domain/hostPorts";
import { EVERY_PATH_GLOB } from "../../../kernel/domain/watchedFiles";
import { joinWorkspacePath } from "../../../kernel/domain/workspacePath";
import { ArtifactService, WatcherResult } from "../../../kernel/service/ArtifactService";

export interface BpmnlintChangeTarget {
    setBpmnlintConfig(editorId: string): Promise<boolean>;
}

/**
 * Locates, reads, and watches the single nearest `.bpmnlintrc`
 *
 * Kept separate from {@link ArtifactService} because the concerns differ:
 * ArtifactService collects element-template / payload *directories* (all matches,
 * nearest-first), whereas bpmnlint resolves a single *file* with
 * nearest-config-wins semantics and no merging.
 */
export class BpmnLintConfigLocator {
    constructor(
        private readonly vsWorkspace: WorkspacePort,
        private readonly vsSettings: SettingsPort,
        private readonly artifacts: ArtifactService,
    ) {}

    /**
     * Finds the single nearest `.bpmnlintrc`, walking from `documentDir` up to
     * the workspace root (inclusive), nearest-first. At each level it checks
     * `<dir>/.bpmnlintrc` first, then `<dir>/<configFolder>/.bpmnlintrc`. The
     * first match wins (no merging) — mirroring bpmnlint's own nearest-config
     * semantics so the modeler and CI lint against the same file.
     *
     * @returns the absolute path of the nearest config, or `undefined` if none.
     */
    async findNearestConfig(documentDir: string): Promise<string | undefined> {
        const configFolder = this.vsSettings.getConfigFolder();
        const workspaceRoot = await this.artifacts.getWorkspaceRoot(documentDir);

        for (const directory of ancestorsUpTo(documentDir, workspaceRoot)) {
            if (await this.hasFile(directory, ".bpmnlintrc")) {
                return joinWorkspacePath(directory, ".bpmnlintrc");
            }
            const configDir = configFolderPath(directory, configFolder);
            if (await this.hasFile(configDir, ".bpmnlintrc")) {
                return joinWorkspacePath(configDir, ".bpmnlintrc");
            }
        }

        return undefined;
    }

    /** Reads the raw config file; the caller owns parsing + error handling. */
    readConfig(path: string): Promise<string> {
        return this.vsWorkspace.readFile(path);
    }

    /** Re-pushes the config on every change that can alter what {@link findNearestConfig} finds. */
    async createWatcher(editorId: string, target: BpmnlintChangeTarget): Promise<WatcherResult> {
        const documentDirectory = this.vsWorkspace.getDocumentDirectory(editorId);
        const workspaceRoot = await this.artifacts.getWorkspaceRoot(documentDirectory);

        const rePushConfig = (path: string) => {
            // Read on every event: the watcher outlives a change of the config folder.
            const configFolder = this.vsSettings.getConfigFolder();
            const lintConfigLookup = {
                documentDirectory,
                workspaceRoot,
                entries: [".bpmnlintrc", configFolderPath("", configFolder, ".bpmnlintrc")],
            };
            if (changesConfigLookup(path, lintConfigLookup)) {
                void target.setBpmnlintConfig(editorId);
            }
        };
        const handle = this.vsWorkspace.createWatcher(workspaceRoot, EVERY_PATH_GLOB, {
            onCreate: rePushConfig,
            onChange: rePushConfig,
            onDelete: rePushConfig,
        });

        return { disposables: [handle], errors: [] };
    }

    /**
     * Whether `dir` directly contains a file named `name`. A missing directory
     * is not an error here — it simply means the file is absent.
     */
    private async hasFile(dir: string, name: string): Promise<boolean> {
        let entries: [string, "file" | "directory"][];
        try {
            entries = await this.vsWorkspace.readDirectory(dir);
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return false;
            }
            throw error;
        }
        return entries.some(([entryName, type]) => entryName === name && type === "file");
    }
}
