import { posix } from "path";

import { ELEMENT_TEMPLATES_FOLDER } from "@miragon/bpmn-modeler-types";

import { ancestorsUpTo } from "../domain/ancestorsUpTo";
import { configFolderPath } from "../domain/configArtifacts";
import { DirectoryNotFound, FileNotFound, NoWorkspaceFolderFoundError } from "../domain/errors";
import { LoggerPort, SettingsPort, WorkspacePort } from "../domain/hostPorts";
import { joinWorkspacePath, parentWorkspacePath } from "../domain/workspacePath";

/**
 * Implemented by {@link import("../../modeler/bpmn/service/BpmnElementTemplatesService").BpmnElementTemplatesService}
 * and accepted by {@link ArtifactService.createWatcher} to avoid a circular
 * module import.
 */
export interface ArtifactChangeTarget {
    refreshElementTemplates(editorId: string): void;
}

export interface WatcherResult {
    disposables: { dispose(): void }[];
    errors: Error[];
}

/**
 * Locates element templates and payloads using a convention-based config
 * folder (default `.camunda/`, overridable via `miragon.bpmnModeler.configFolder`).
 * At every directory level from the BPMN file up to the workspace root,
 * `<configFolder>/element-templates/` and `<configFolder>/payloads/` are
 * collected nearest-first. Also creates filesystem watchers that re-push
 * templates to the webview when any of those files change.
 */
export class ArtifactService {
    constructor(
        private readonly vsWorkspace: WorkspacePort,
        private readonly vsSettings: SettingsPort,
        // Optional so the two hosts (VS Code + bridge) can opt in without every
        // ArtifactService call-site or test having to supply a logger. Used only
        // for debug-level "why did nothing load?" diagnostics.
        private readonly logger?: LoggerPort,
    ) {}

    /**
     * Resolution order: VS Code workspace folder → enclosing git repo →
     * the document directory itself.
     */
    async getWorkspaceRoot(documentDir: string): Promise<string> {
        try {
            return this.vsWorkspace.getWorkspaceFolderForDocument(documentDir);
        } catch (error) {
            if (error instanceof NoWorkspaceFolderFoundError) {
                const gitRoot = await this.findGitRoot(documentDir);
                return gitRoot ?? documentDir;
            }
            throw error;
        }
    }

    private async findGitRoot(startDir: string): Promise<string | undefined> {
        let current: string | undefined = startDir;
        while (current !== undefined) {
            if (await this.holdsGitEntry(current)) {
                return current;
            }
            current = parentWorkspacePath(current);
        }
        return undefined;
    }

    /**
     * Probes `.git` instead of listing `directory`: every ancestor of an opened
     * document can be traversed, but not necessarily listed. `.git` is a
     * directory in a clone and a file in worktrees and submodules.
     */
    private async holdsGitEntry(directory: string): Promise<boolean> {
        const gitEntry = joinWorkspacePath(directory, ".git");
        return (
            (await succeeds(() => this.vsWorkspace.readDirectory(gitEntry))) ||
            (await succeeds(() => this.vsWorkspace.readFile(gitEntry)))
        );
    }

    async collectTemplateDirs(
        documentDir: string,
        workspaceRoot: string,
        configFolder: string,
    ): Promise<string[]> {
        return this.collectSubDirs(
            documentDir,
            workspaceRoot,
            configFolder,
            ELEMENT_TEMPLATES_FOLDER,
        );
    }

    /**
     * Walks from `documentDir` to `workspaceRoot` (inclusive), nearest-first.
     */
    private async collectSubDirs(
        documentDir: string,
        workspaceRoot: string,
        configFolder: string,
        subFolder: string,
    ): Promise<string[]> {
        const dirs: string[] = [];

        for (const directory of ancestorsUpTo(documentDir, workspaceRoot)) {
            const targetDir = configFolderPath(directory, configFolder, subFolder);
            try {
                await this.vsWorkspace.readDirectory(targetDir);
                dirs.push(targetDir);
            } catch (error) {
                if (!(error instanceof DirectoryNotFound)) {
                    throw error;
                }
            }
        }

        return dirs;
    }

    /**
     * Walks from `documentDir` to `workspaceRoot` (inclusive), nearest-first, and
     * returns the first directory whose `<configFolder>/<fileName>` exists. The
     * generalised sibling of {@link collectSubDirs} for single-file config
     * lookups (deployment targets).
     */
    async findConfigBaseDir(
        documentDir: string,
        configFolder: string,
        fileName: string,
        workspaceRoot: string,
    ): Promise<string | undefined> {
        for (const directory of ancestorsUpTo(documentDir, workspaceRoot)) {
            if (await this.fileExists(configFolderPath(directory, configFolder, fileName))) {
                return directory;
            }
        }

        return undefined;
    }

    private async fileExists(path: string): Promise<boolean> {
        try {
            await this.vsWorkspace.readFile(path);
            return true;
        } catch (error) {
            if (error instanceof FileNotFound) return false;
            throw error;
        }
    }

    async getTemplateDirs(documentDir: string): Promise<string[]> {
        const configFolder = this.vsSettings.getConfigFolder();
        const workspaceRoot = await this.getWorkspaceRoot(documentDir);
        const templateDirs = await this.collectTemplateDirs(
            documentDir,
            workspaceRoot,
            configFolder,
        );

        // Debug-level trail for the "no templates showed up" support case: the
        // resolved config folder + root are the two inputs that most often
        // explain an empty scan, and an explicit "no directory found" line names
        // the range walked so the user knows where the modeler looked.
        this.logger?.logDebug(
            `Element-template scan: configFolder="${configFolder}", root="${workspaceRoot}", ` +
                `documentDir="${documentDir}" → ${templateDirs.length} directory(ies)` +
                (templateDirs.length > 0 ? `: ${templateDirs.join(", ")}` : ""),
        );
        if (templateDirs.length === 0) {
            this.logger?.logDebug(
                `No "${configFolder}/${ELEMENT_TEMPLATES_FOLDER}" directory found between ` +
                    `${documentDir} and ${workspaceRoot}.`,
            );
        }

        return templateDirs;
    }

    async getPayloadPaths(documentDir: string): Promise<string[]> {
        const configFolder = this.vsSettings.getConfigFolder();
        const workspaceRoot = await this.getWorkspaceRoot(documentDir);
        const payloadDirs = await this.collectSubDirs(
            documentDir,
            workspaceRoot,
            configFolder,
            "payloads",
        );

        const allPaths: string[] = [];
        for (const dir of payloadDirs) {
            allPaths.push(...(await this.readDirectory(dir, ".json")));
        }
        return allPaths;
    }

    readFile(path: string): Promise<string> {
        return this.vsWorkspace.readFile(path);
    }

    /**
     * `target` is a method parameter (not a constructor argument) to break
     * the templates-service ↔ ArtifactService circular dependency.
     */
    async createWatcher(editorId: string, target: ArtifactChangeTarget): Promise<WatcherResult> {
        const documentDir = posix.dirname(editorId);
        const configFolder = this.vsSettings.getConfigFolder();
        const workspaceRoot = await this.getWorkspaceRoot(documentDir);

        // No `*.json` suffix: a one-shot folder copy into element-templates can
        // surface as a single directory-create event, which a file-extension
        // glob would filter out and the templates would stay stale until reopen.
        // Over-firing is harmless — the refresh re-scans from disk and applies
        // the `.json` filter itself.
        const pattern = posix.join("**", configFolder, ELEMENT_TEMPLATES_FOLDER, "**");
        const refreshTemplates = () => target.refreshElementTemplates(editorId);
        const handle = this.vsWorkspace.createWatcher(workspaceRoot, pattern, {
            onCreate: refreshTemplates,
            onChange: refreshTemplates,
            onDelete: refreshTemplates,
        });

        return { disposables: [handle], errors: [] };
    }

    async readDirectory(folder: string, extension: string): Promise<string[]> {
        let entries: [string, "file" | "directory"][];
        try {
            entries = await this.vsWorkspace.readDirectory(folder);
        } catch (error) {
            if (error instanceof DirectoryNotFound) {
                return [];
            }
            throw error;
        }

        const files: string[] = [];
        for (const [name, type] of entries) {
            if (type === "directory") {
                files.push(...(await this.readDirectory(`${folder}/${name}`, extension)));
            } else if (type === "file" && name.endsWith(extension)) {
                files.push(`${folder}/${name}`);
            }
        }
        return files;
    }
}

async function succeeds(operation: () => Promise<unknown>): Promise<boolean> {
    try {
        await operation();
        return true;
    } catch {
        return false;
    }
}
