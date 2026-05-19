import { posix } from "path";

import { Disposable, RelativePattern, workspace } from "vscode";

import { DirectoryNotFound, NoWorkspaceFolderFoundError } from "../domain/errors";
import { VsCodeWorkspace } from "../infrastructure/VsCodeWorkspace";
import { VsCodeSettings } from "../infrastructure/VsCodeSettings";

/**
 * Implemented by {@link BpmnModelerService} and accepted by
 * {@link ArtifactService.createWatcher} to avoid a circular module import.
 */
export interface ArtifactChangeTarget {
    setElementTemplates(editorId: string): Promise<boolean>;
}

export interface WatcherResult {
    disposables: Disposable[];
    errors: Error[];
}

/**
 * Locates element templates and payloads using a convention-based config
 * folder (default `.camunda/`, overridable via `miragon.bpmnModeler.config`).
 * At every directory level from the BPMN file up to the workspace root,
 * `<configFolder>/element-templates/` and `<configFolder>/payloads/` are
 * collected nearest-first. Also creates filesystem watchers that re-push
 * templates to the webview when any of those files change.
 */
export class ArtifactService {
    constructor(
        private readonly vsWorkspace: VsCodeWorkspace,
        private readonly vsSettings: VsCodeSettings,
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
                const gitRoot = await this.vsWorkspace.findGitRoot(documentDir);
                return gitRoot ?? documentDir;
            }
            throw error;
        }
    }

    async collectTemplateDirs(
        documentDir: string,
        workspaceRoot: string,
        configFolder: string,
    ): Promise<string[]> {
        return this.collectSubDirs(documentDir, workspaceRoot, configFolder, "element-templates");
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
        let current = documentDir;

        while (current === workspaceRoot || current.startsWith(workspaceRoot + "/")) {
            const targetDir = posix.join(current, configFolder, subFolder);
            try {
                await this.vsWorkspace.readDirectory(targetDir);
                dirs.push(targetDir);
            } catch (error) {
                if (!(error instanceof DirectoryNotFound)) {
                    throw error;
                }
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

        return dirs;
    }

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
     * the `BpmnModelerService ↔ ArtifactService` circular dependency.
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
