import { posix } from "path";

import { DirectoryNotFound, NoWorkspaceFolderFoundError } from "../domain/errors";
import { LoggerPort, SettingsPort, WorkspacePort } from "../domain/hostPorts";

/**
 * Implemented by {@link import("../../modeler/bpmn/service/BpmnElementTemplatesService").BpmnElementTemplatesService}
 * and accepted by {@link ArtifactService.createWatcher} to avoid a circular
 * module import.
 */
export interface ArtifactChangeTarget {
    setElementTemplates(editorId: string): Promise<boolean>;
}

export interface WatcherResult {
    disposables: { dispose(): void }[];
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

        // Strip a trailing slash so a drive-root workspace (`/c:/`) still matches:
        // otherwise the guard tests `startsWith("/c://")` and the `===` check never
        // hits, since the `posix.dirname` walk yields `/c:`, never `/c:/`.
        const root = this.stripTrailingSlash(workspaceRoot);

        while (current === root || current.startsWith(root + "/")) {
            const targetDir = posix.join(current, configFolder, subFolder);
            try {
                await this.vsWorkspace.readDirectory(targetDir);
                dirs.push(targetDir);
            } catch (error) {
                if (!(error instanceof DirectoryNotFound)) {
                    throw error;
                }
            }

            if (current === root) {
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

    /**
     * Drops a single trailing slash unless the path is the filesystem root
     * itself (`/`). Normalizes a drive-root workspace (`/c:/`) so it compares
     * against the `posix.dirname` walk, which never re-introduces the slash.
     */
    private stripTrailingSlash(path: string): string {
        return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
    }

    async getArtifactPaths(documentDir: string): Promise<[string[], string]> {
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
                `No "${configFolder}/element-templates" directory found between ` +
                    `${documentDir} and ${workspaceRoot}.`,
            );
        }

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
     * the templates-service ↔ ArtifactService circular dependency.
     */
    async createWatcher(editorId: string, target: ArtifactChangeTarget): Promise<WatcherResult> {
        const documentDir = posix.dirname(editorId);
        const configFolder = this.vsSettings.getConfigFolder();
        const workspaceRoot = await this.getWorkspaceRoot(documentDir);

        // No `*.json` suffix: a one-shot folder copy into element-templates can
        // surface as a single directory-create event, which a file-extension
        // glob would filter out and the templates would stay stale until reopen.
        // Over-firing is harmless — the refresh below re-scans from disk and
        // `getArtifactPaths` applies the `.json` filter itself.
        const pattern = `**/${configFolder}/element-templates/**`;
        // A watcher callback's rejection has no caller to await it, so a failed
        // re-push (unreadable template dir, gone webview) would float away as an
        // unhandled rejection instead of reaching the channel.
        const repushTemplates = () => {
            target.setElementTemplates(editorId).catch((error) => {
                this.logger?.logError(error instanceof Error ? error : new Error(String(error)));
            });
        };
        const handle = this.vsWorkspace.createWatcher(workspaceRoot, pattern, {
            onCreate: repushTemplates,
            onChange: repushTemplates,
            onDelete: repushTemplates,
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
