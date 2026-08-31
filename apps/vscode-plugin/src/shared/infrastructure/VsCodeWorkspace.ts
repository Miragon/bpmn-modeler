import { posix } from "path";

import { FileSystemError, FileType, RelativePattern, workspace } from "vscode";

import {
    DirectoryNotFound,
    FileNotFound,
    NoWorkspaceFolderFoundError,
} from "@miragon/bpmn-modeler-core";
import { WorkspacePort } from "@miragon/bpmn-modeler-core";
import { canonicalPath, toUri } from "./uriPath";

const fs = workspace.fs;

/**
 * VS Code workspace-folder discovery and filesystem access, used by
 * {@link ArtifactService}.
 */
export class VsCodeWorkspace implements WorkspacePort {
    /** Returns the workspace folder path containing `document`, throwing {@link NoWorkspaceFolderFoundError} when it lies outside every open folder. */
    getWorkspaceFolderForDocument(document: string): string {
        const workspaceFolder = workspace.getWorkspaceFolder(toUri(document));
        if (!workspaceFolder) {
            throw new NoWorkspaceFolderFoundError();
        }
        return canonicalPath(workspaceFolder.uri);
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
        const workspaceFolder = workspace.getWorkspaceFolder(toUri(document));
        return workspaceFolder ? canonicalPath(workspaceFolder.uri) : undefined;
    }

    /**
     * Lists the open workspace-folder root paths — empty when no folder is
     * open (the loose-file / single-file-window case).
     */
    getWorkspaceFolderPaths(): string[] {
        return (workspace.workspaceFolders ?? []).map((folder) => canonicalPath(folder.uri));
    }

    /**
     * Returns the directory containing `document` in the `uri.path` form the
     * rest of this adapter speaks.
     *
     * Routing the OS path through `toUri(...)` + `canonicalPath` is what lets
     * callers pass a raw `uri.fsPath` (or a `file://` string) and stay free of
     * `vscode.Uri`; the normalization matters on Windows, where `fsPath`
     * (`c:\a\b`) and `uri.path` (`/c:/a/b`) diverge and the drive-letter casing
     * must be canonicalized to compare against the workspace root.
     */
    getDocumentDirectory(document: string): string {
        return posix.dirname(canonicalPath(toUri(document)));
    }

    /**
     * Walks upward from `startDir` for a directory containing a `.git` entry.
     * Returns `undefined` at the filesystem root or when a directory cannot be
     * read.
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
            // Filesystem root reached — dirname is a fixed point here.
            if (parent === current) {
                return undefined;
            }
            current = parent;
        }
    }

    /**
     * Lists the direct children of a directory as `[name, type]` tuples;
     * symbolic links and other non-file/directory entries are excluded.
     */
    async readDirectory(path: string): Promise<[string, "file" | "directory"][]> {
        let dir: [string, FileType][];
        try {
            dir = await fs.readDirectory(toUri(path));
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
     * Reads a file as a UTF-8 string. Throws {@link FileNotFound} only when the
     * file is absent; any other fs failure (permission denied, target is a
     * directory, …) propagates unchanged so callers can surface it —
     * `ScriptVariableManifestService` relies on this to distinguish "no manifest"
     * from "manifest unreadable" (mirrors `NodeWorkspace.readFile`).
     */
    async readFile(path: string): Promise<string> {
        try {
            const buffer = await fs.readFile(toUri(path));
            return buffer.toString();
        } catch (error) {
            if (error instanceof FileSystemError && error.code === "FileNotFound") {
                throw new FileNotFound(path);
            }
            throw error;
        }
    }

    /** Writes content to a file, creating it if it does not exist. */
    async writeFile(path: string, content: string): Promise<void> {
        const uri = toUri(path);
        // Create the parent directory first (idempotent). `fs.writeFile` already
        // mkdirps via FileService, so this is platform-proof insurance for the
        // code-link artifact's nested target paths rather than a hard requirement.
        // Deriving the parent from `uri.path` keeps this correct for both plain
        // and `file://`-form inputs.
        await fs.createDirectory(toUri(posix.dirname(uri.path)));
        await fs.writeFile(uri, Buffer.from(content));
    }

    /**
     * Recursively deletes the directory at `path`, tolerating a missing target.
     *
     * A `FileNotFound` is swallowed so pruning a marketplace cache slot that was
     * already removed (or never written) is a silent no-op, matching the port
     * contract; any other failure propagates so a real fs error is not masked.
     */
    async deleteDirectory(path: string): Promise<void> {
        try {
            await fs.delete(toUri(path), { recursive: true });
        } catch (error) {
            if (error instanceof FileSystemError && error.code === "FileNotFound") {
                return;
            }
            throw error;
        }
    }

    /**
     * Finds files matching `glob`. `exclude` is forwarded to
     * {@link workspace.findFiles}: `undefined` keeps VS Code's default
     * (`files.exclude` only), a glob string adds those patterns on top, and
     * `null` opts out of every default exclude.
     */
    async findFiles(pattern: string, exclude?: string | null, limit?: number): Promise<string[]> {
        const uris = await workspace.findFiles(pattern, exclude, limit);
        return uris.map((uri) => canonicalPath(uri));
    }

    /**
     * Creates a workspace-scoped filesystem watcher for `glob` rooted at
     * `rootPath`. Hides `workspace.createFileSystemWatcher` + `RelativePattern`
     * and the `Uri`-typed event payloads so service callers stay free of
     * `vscode` imports.
     *
     * Handlers receive the `uri.path` (POSIX) form, deliberately matching what
     * {@link findFiles} returns: the code-link watcher compares changed-file
     * paths against locator results, and `fsPath` (back-slashed, drive-prefixed
     * on Windows) would never compare equal to a `uri.path`-style match.
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
        // A `Uri` base keeps `RelativePattern` correct when the root arrives in
        // `file://` form (`editorId` = `uri.toString()`): a raw string base is
        // taken literally, so `file:///c%3A/…` would never match anything and
        // the watcher would silently never fire.
        const watcher = workspace.createFileSystemWatcher(
            new RelativePattern(toUri(rootPath), glob),
        );
        const subscriptions: { dispose(): void }[] = [watcher];
        const { onCreate, onChange, onDelete } = handlers;
        if (onCreate) {
            subscriptions.push(watcher.onDidCreate((uri) => onCreate(canonicalPath(uri))));
        }
        if (onChange) {
            subscriptions.push(watcher.onDidChange((uri) => onChange(canonicalPath(uri))));
        }
        if (onDelete) {
            subscriptions.push(watcher.onDidDelete((uri) => onDelete(canonicalPath(uri))));
        }
        return {
            dispose(): void {
                for (const s of subscriptions) {
                    s.dispose();
                }
            },
        };
    }

    /** Maps a VS Code `FileType` to `"file"`, `"directory"`, `"symbolicLink"`, or `"unknown"`. */
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
