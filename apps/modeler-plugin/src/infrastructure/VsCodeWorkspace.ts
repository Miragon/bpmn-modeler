import { posix } from "path";

import { FileType, GlobPattern, Uri, workspace } from "vscode";

import {
    DirectoryNotFound,
    FileNotFound,
    NoWorkspaceFolderFoundError,
} from "../domain/errors";

const fs = workspace.fs;

/**
 * VS Code workspace and filesystem helpers.
 *
 * Combines workspace-folder discovery (formerly `VsCodeWorkspaceAdapter`) and
 * filesystem access (formerly `VsCodeReadAdapter`) into a single infrastructure
 * class used by {@link ArtifactService}.
 */
export class VsCodeWorkspace {
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
            // Stop at filesystem root (dirname returns the same path).
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
     * @returns An array of absolute file paths.
     */
    async findFiles(
        pattern: GlobPattern,
        exclude?: GlobPattern | null,
    ): Promise<string[]> {
        const uris = await workspace.findFiles(pattern, exclude);
        return uris.map((uri) => uri.path);
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
