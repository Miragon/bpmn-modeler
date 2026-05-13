import { posix } from "path";

import { Disposable, RelativePattern, workspace } from "vscode";

import { DirectoryNotFound, NoWorkspaceFolderFoundError } from "../domain/errors";
import { VsCodeWorkspace } from "../infrastructure/VsCodeWorkspace";
import { VsCodeSettings } from "../infrastructure/VsCodeSettings";

/**
 * Minimal interface implemented by {@link BpmnModelerService} and accepted by
 * {@link ArtifactService.createWatcher} to avoid a circular module import.
 */
export interface ArtifactChangeTarget {
    /**
     * Re-sends the current set of element templates to the webview for the given editor.
     * @param editorId Document URI path of the target editor.
     */
    setElementTemplates(editorId: string): Promise<boolean>;
}

/**
 * Result of creating watchers: the disposables to track and any errors.
 */
export interface WatcherResult {
    /** Disposables for the created file system watchers. */
    disposables: Disposable[];
    /** Errors that occurred while creating individual watchers. */
    errors: Error[];
}

/**
 * Application service responsible for locating element templates using a
 * convention-based config folder (e.g. `.camunda/element-templates/`) and
 * maintaining filesystem watchers for them.
 *
 * The config folder name is read from the `miragon.bpmnModeler.config` VS Code
 * setting. Element templates are always found under
 * `<configFolder>/element-templates/` at each directory level from the BPMN
 * file up to the workspace root.
 */
export class ArtifactService {
    /**
     * @param vsWorkspace Infrastructure helper for workspace/filesystem access.
     * @param vsSettings Infrastructure helper for VS Code settings.
     */
    constructor(
        private readonly vsWorkspace: VsCodeWorkspace,
        private readonly vsSettings: VsCodeSettings,
    ) {}

    // ─── Workspace root resolution ────────────────────────────────────────────

    /**
     * Determines the workspace root for a given document directory.
     *
     * Resolution order:
     * 1. VS Code workspace folder containing the document.
     * 2. Git repository root (walks upward looking for `.git`).
     * 3. The document directory itself if no enclosing root is found.
     *
     * @param documentDir Directory containing the open document.
     * @returns Absolute path to the workspace root.
     */
    async getWorkspaceRoot(documentDir: string): Promise<string> {
        try {
            return this.vsWorkspace.getWorkspaceFolderForDocument(documentDir);
        } catch (error) {
            if (error instanceof NoWorkspaceFolderFoundError) {
                const gitRoot = await this.vsWorkspace.findGitRoot(documentDir);
                return gitRoot ?? documentDir;
            }
            throw error;
        }
    }

    // ─── Template directory collection ────────────────────────────────────────

    /**
     * Collects element-template directories from `documentDir` up to
     * `workspaceRoot` (inclusive), ordered nearest-first.
     *
     * At each directory level the path `<level>/<configFolder>/element-templates`
     * is checked. Levels where the directory does not exist are silently skipped.
     *
     * @param documentDir Starting directory (the BPMN file's directory).
     * @param workspaceRoot Upper bound for the upward walk.
     * @param configFolder Name of the config folder (e.g. `.camunda`).
     * @returns Absolute paths to existing element-template directories, nearest-first.
     */
    async collectTemplateDirs(
        documentDir: string,
        workspaceRoot: string,
        configFolder: string,
    ): Promise<string[]> {
        return this.collectSubDirs(documentDir, workspaceRoot, configFolder, "element-templates");
    }

    /**
     * Collects sub-directories of the config folder from `documentDir` up to
     * `workspaceRoot` (inclusive), ordered nearest-first.
     *
     * At each directory level the path `<level>/<configFolder>/<subFolder>`
     * is checked. Levels where the directory does not exist are silently skipped.
     *
     * @param documentDir Starting directory (the BPMN file's directory).
     * @param workspaceRoot Upper bound for the upward walk.
     * @param configFolder Name of the config folder (e.g. `.camunda`).
     * @param subFolder Name of the sub-folder to search for (e.g. `"element-templates"`, `"payloads"`).
     * @returns Absolute paths to existing sub-directories, nearest-first.
     */
    private async collectSubDirs(
        documentDir: string,
        workspaceRoot: string,
        configFolder: string,
        subFolder: string,
    ): Promise<string[]> {
        const dirs: string[] = [];
        let current = documentDir;

        // Walk upward from documentDir to workspaceRoot (inclusive).
        // The condition ensures we stay within the workspace boundary.
        while (current === workspaceRoot || current.startsWith(workspaceRoot + "/")) {
            const targetDir = posix.join(current, configFolder, subFolder);
            try {
                // Probe for the directory by reading it; only add if it exists.
                await this.vsWorkspace.readDirectory(targetDir);
                dirs.push(targetDir);
            } catch (error) {
                if (!(error instanceof DirectoryNotFound)) {
                    throw error;
                }
                // Directory doesn't exist at this level — skip silently.
            }

            if (current === workspaceRoot) {
                break;
            }

            const parent = posix.dirname(current);
            // Guard against infinite loop at filesystem root.
            if (parent === current) {
                break;
            }
            current = parent;
        }

        return dirs;
    }

    // ─── Artifact path enumeration ────────────────────────────────────────────

    /**
     * Returns the file paths for all element-template JSON files discoverable
     * from the given document directory.
     *
     * Uses the `miragon.bpmnModeler.config` setting to determine the config
     * folder name, then collects templates from all matching directories from
     * the document directory up to the workspace root.
     *
     * @param documentDir Directory of the open document.
     * @returns A tuple of `[absoluteFilePaths[], ".json"]`.
     */
    async getArtifactPaths(documentDir: string): Promise<[string[], string]> {
        const configFolder = this.vsSettings.getConfigFolder();
        const workspaceRoot = await this.getWorkspaceRoot(documentDir);
        const templateDirs = await this.collectTemplateDirs(
            documentDir,
            workspaceRoot,
            configFolder,
        );

        const allPaths: string[] = [];
        for (const dir of templateDirs) {
            allPaths.push(...(await this.readDirectory(dir, ".json")));
        }
        return [allPaths, ".json"];
    }

    /**
     * Returns the file paths for all JSON payload files discoverable from the
     * given document directory, searching `<configFolder>/payloads/` at each
     * directory level up to the workspace root.
     *
     * @param documentDir Directory of the open document.
     * @returns Absolute paths to all discovered `.json` payload files.
     */
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

    /**
     * Reads a file and returns its content as a UTF-8 string.
     *
     * @param path Absolute path to the file.
     */
    readFile(path: string): Promise<string> {
        return this.vsWorkspace.readFile(path);
    }

    // ─── Filesystem watcher ───────────────────────────────────────────────────

    /**
     * Creates a single {@link FileSystemWatcher} for element-template JSON
     * files under the config folder, scoped to the workspace root.
     *
     * When any matching file is created, changed, or deleted,
     * `target.setElementTemplates` is called to refresh the webview.
     *
     * The `target` is passed as a method parameter (rather than a constructor
     * argument) to break the `BpmnModelerService ↔ ArtifactService` circular
     * dependency.
     *
     * @param editorId Document URI path of the BPMN editor.
     * @param target Service that exposes `setElementTemplates`.
     * @returns Disposables for created watchers and any errors that occurred.
     */
    async createWatcher(editorId: string, target: ArtifactChangeTarget): Promise<WatcherResult> {
        const documentDir = posix.dirname(editorId);
        const configFolder = this.vsSettings.getConfigFolder();
        const workspaceRoot = await this.getWorkspaceRoot(documentDir);

        const pattern = `**/${configFolder}/element-templates/**/*.json`;
        const watcher = workspace.createFileSystemWatcher(
            new RelativePattern(workspaceRoot, pattern),
        );

        watcher.onDidCreate(() => target.setElementTemplates(editorId));
        watcher.onDidChange(() => target.setElementTemplates(editorId));
        watcher.onDidDelete(() => target.setElementTemplates(editorId));

        return { disposables: [watcher], errors: [] };
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Recursively lists all files with the given extension under `folder`.
     *
     * @param folder Absolute path to the directory to search.
     * @param extension File extension filter (e.g. `".json"`).
     * @returns Absolute paths of all matching files.
     */
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
