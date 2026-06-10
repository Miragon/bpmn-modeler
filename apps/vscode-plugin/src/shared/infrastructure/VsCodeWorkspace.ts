import { posix } from "path";

import { FileType, RelativePattern, Uri, workspace } from "vscode";

import {
    DirectoryNotFound,
    FileNotFound,
    NoWorkspaceFolderFoundError,
} from "@miragon/bpmn-modeler-core";
import { WorkspacePort } from "@miragon/bpmn-modeler-core";

const fs = workspace.fs;

/**
 * VS Code workspace and filesystem helpers.
 *
 * Combines workspace-folder discovery (formerly `VsCodeWorkspaceAdapter`) and
 * filesystem access (formerly `VsCodeReadAdapter`) into a single infrastructure
 * class used by {@link ArtifactService}.
 */
export class VsCodeWorkspace implements WorkspacePort {
    /**
     * Returns the workspace folder path for the given document.
     *
     * @param document Absolute path to the document file.
     * @returns The workspace folder path.
     * @throws {NoWorkspaceFolderFoundError} If the document is not inside any workspace folder.
     */
    getWorkspaceFolderForDocument(document: string): string {
        const workspaceFolder = workspace.getWorkspaceFolder(Uri.file(document));
        if (!workspaceFolder) {
            throw new NoWorkspaceFolderFoundError();
        }
        return workspaceFolder.uri.path;
    }

    /**
     * Returns the path of the workspace folder containing `document`, or
     * `undefined` when the document lies outside every open folder.
     *
     * Non-throwing companion to {@link getWorkspaceFolderForDocument}: the
     * model-navigation search treats "no containing folder" as the signal to
     * fall back to a loose-file fs walk, so absence is an expected outcome
     * rather than an error.
     */
    findWorkspaceFolderForDocument(document: string): string | undefined {
        return workspace.getWorkspaceFolder(Uri.file(document))?.uri.path;
    }

    /**
     * Lists the open workspace-folder root paths — empty when no folder is
     * open (the loose-file / single-file-window case).
     */
    getWorkspaceFolderPaths(): string[] {
        return (workspace.workspaceFolders ?? []).map((folder) => folder.uri.path);
    }

    /**
     * Returns the directory containing `document` in the `uri.path` form the
     * rest of this adapter speaks.
     *
     * Routing the OS path through `Uri.file(...).path` is what lets callers
     * pass a raw `uri.fsPath` and stay free of `vscode.Uri`; the normalization
     * matters on Windows, where `fsPath` (`c:\a\b`) and `uri.path`
     * (`/c:/a/b`) diverge.
     */
    getDocumentDirectory(document: string): string {
        return posix.dirname(Uri.file(document).path);
    }

    /**
     * Walks upward from `startDir` looking for a directory containing a `.git`
     * entry, indicating the root of a git repository.
     *
     * Stops when the filesystem root is reached or a directory cannot be read.
     *
     * @param startDir Absolute path to the directory to start from.
     * @returns The path of the directory that contains `.git`, or `undefined` if
     *   no git root is found.
     */
    async findGitRoot(startDir: string): Promise<string | undefined> {
        let current = startDir;

        while (true) {
            try {
                const entries = await this.readDirectory(current);
                if (entries.some(([name]) => name === ".git")) {
                    return current;
                }
            } catch {
                // Cannot read directory — stop walking.
                return undefined;
            }

            const parent = posix.dirname(current);
            /**
             * Stop at filesystem root (dirname returns the same path).
             */
            if (parent === current) {
                return undefined;
            }
            current = parent;
        }
    }

    /**
     * Lists the direct children of a directory.
     *
     * @param path Absolute path to the directory.
     * @returns An array of `[name, type]` tuples where type is `"file"` or `"directory"`.
     *   Symbolic links and other types are excluded.
     */
    async readDirectory(path: string): Promise<[string, "file" | "directory"][]> {
        let dir: [string, FileType][];
        try {
            dir = await fs.readDirectory(Uri.file(path));
        } catch {
            throw new DirectoryNotFound(path);
        }
        return dir.flatMap(([name, type]) => {
            const t = this.parseFileType(type);
            if (t !== "file" && t !== "directory") {
                return [];
            }
            return [[name, t]];
        });
    }

    /**
     * Reads a file and returns its content as a UTF-8 string.
     *
     * @param path Absolute path to the file.
     * @returns The file content as a string.
     * @throws {FileNotFound} If the file does not exist or cannot be read.
     */
    async readFile(path: string): Promise<string> {
        return fs.readFile(Uri.file(path)).then(
            (buffer) => buffer.toString(),
            (reason) => {
                throw new FileNotFound(reason);
            },
        );
    }

    /**
     * Writes content to a file on disk, creating it if it does not exist.
     *
     * @param path Absolute path to the file.
     * @param content The string content to write.
     */
    async writeFile(path: string, content: string): Promise<void> {
        await fs.writeFile(Uri.file(path), Buffer.from(content));
    }

    /**
     * Finds files in the workspace matching the given glob pattern.
     *
     * @param pattern A glob pattern (e.g. `"**\/*.bpmn"`).
     * @param exclude Optional glob (or `null`) forwarded to
     *   {@link workspace.findFiles}.  `undefined` keeps VS Code's default
     *   (`files.exclude` only); a glob string adds those patterns on top;
     *   `null` opts out of every default exclude.
     * @param limit Optional cap on the number of results returned, forwarded
     *   as `maxResults` to {@link workspace.findFiles}.
     * @returns An array of absolute file paths.
     */
    async findFiles(pattern: string, exclude?: string | null, limit?: number): Promise<string[]> {
        const uris = await workspace.findFiles(pattern, exclude, limit);
        return uris.map((uri) => uri.path);
    }

    /**
     * Creates a workspace-scoped filesystem watcher for `glob` rooted at
     * `rootPath`. Hides `workspace.createFileSystemWatcher` + `RelativePattern`
     * and the `Uri`-typed event payloads so service callers stay free of
     * `vscode` imports — handlers receive the absolute `uri.fsPath` string.
     *
     * The returned handle disposes the underlying watcher and unsubscribes
     * the wired listeners in one call.
     */
    createWatcher(
        rootPath: string,
        glob: string,
        handlers: {
            onChange?: (path: string) => void;
            onCreate?: (path: string) => void;
            onDelete?: (path: string) => void;
        },
    ): { dispose(): void } {
        const watcher = workspace.createFileSystemWatcher(new RelativePattern(rootPath, glob));
        const subscriptions: { dispose(): void }[] = [watcher];
        const { onCreate, onChange, onDelete } = handlers;
        if (onCreate) {
            subscriptions.push(watcher.onDidCreate((uri) => onCreate(uri.fsPath)));
        }
        if (onChange) {
            subscriptions.push(watcher.onDidChange((uri) => onChange(uri.fsPath)));
        }
        if (onDelete) {
            subscriptions.push(watcher.onDidDelete((uri) => onDelete(uri.fsPath)));
        }
        return {
            dispose(): void {
                for (const s of subscriptions) {
                    s.dispose();
                }
            },
        };
    }

    /**
     * Maps a VS Code `FileType` enum value to a simplified string.
     *
     * @param type The VS Code FileType value.
     * @returns `"file"`, `"directory"`, `"symbolicLink"`, or `"unknown"`.
     */
    private parseFileType(type: FileType): string {
        switch (type) {
            case FileType.File:
                return "file";
            case FileType.Directory:
                return "directory";
            case FileType.SymbolicLink:
                return "symbolicLink";
            default:
                return "unknown";
        }
    }
}
