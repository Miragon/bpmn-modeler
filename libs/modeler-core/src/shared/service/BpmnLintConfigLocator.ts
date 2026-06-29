import { posix } from "path";

import { DirectoryNotFound } from "../domain/errors";
import { SettingsPort, WorkspacePort } from "../domain/hostPorts";
import { ArtifactService, WatcherResult } from "./ArtifactService";

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
        let current = documentDir;

        while (current === workspaceRoot || current.startsWith(workspaceRoot + "/")) {
            if (await this.hasFile(current, ".bpmnlintrc")) {
                return posix.join(current, ".bpmnlintrc");
            }
            const configDir = posix.join(current, configFolder);
            if (await this.hasFile(configDir, ".bpmnlintrc")) {
                return posix.join(configDir, ".bpmnlintrc");
            }

            if (current === workspaceRoot) {
                break;
            }

            const parent = posix.dirname(current);
            /**
             * Guard against infinite loop at filesystem root.
             */
            if (parent === current) {
                break;
            }
            current = parent;
        }

        return undefined;
    }

    /** Reads the raw config file; the caller owns parsing + error handling. */
    readConfig(path: string): Promise<string> {
        return this.vsWorkspace.readFile(path);
    }

    /**
     * Watches for `.bpmnlintrc` changes anywhere under the workspace root
     * and re-pushes the config on create/change/delete.
     */
    async createWatcher(editorId: string, target: BpmnlintChangeTarget): Promise<WatcherResult> {
        const documentDir = posix.dirname(editorId);
        const workspaceRoot = await this.artifacts.getWorkspaceRoot(documentDir);

        const pattern = `**/.bpmnlintrc`;
        const handle = this.vsWorkspace.createWatcher(workspaceRoot, pattern, {
            onCreate: () => void target.setBpmnlintConfig(editorId),
            onChange: () => void target.setBpmnlintConfig(editorId),
            onDelete: () => void target.setBpmnlintConfig(editorId),
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
