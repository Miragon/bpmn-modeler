import { posix } from "path";

import {
    DirectoryNotFound,
    FileNotFound,
    NoWorkspaceFolderFoundError,
} from "../kernel/domain/errors";
import { globToRegExp } from "../kernel/domain/globToRegExp";
import { WorkspacePort } from "../kernel/domain/hostPorts";
import { isWithinRoot, relativeToRoot } from "../kernel/domain/rootContainment";
import { withoutFileScheme } from "../kernel/domain/workspacePath";

export interface WatcherHandlers {
    onChange?: (path: string) => void;
    onCreate?: (path: string) => void;
    onDelete?: (path: string) => void;
}

export interface WorkspaceWatcher {
    readonly root: string;
    readonly glob: string;
    readonly handlers: WatcherHandlers;
    disposed: boolean;
}

/**
 * Workspace folders and files held in memory. Paths are accepted plain or as
 * `file://` URIs, as the hosts accept them, and are held and reported plain.
 * Writing a file creates its parent directories, which outlive their last
 * file as on a disk.
 * File mutations, through the port or through {@link deleteFile}, notify the
 * live watchers whose root and glob match before they return, so a test drives
 * watcher-based behaviour by changing files. A directory created or deleted as
 * a whole reports one event for the directory and none for its files, as VS
 * Code reports a folder moved in or out.
 * `watchers` keeps every watcher ever created, disposed ones included, so a
 * test can check what was watched and fire an event no file change produces.
 * Folders can change later, as in a VS Code multi-root workspace; the port has
 * no event for that.
 */
export class InMemoryWorkspace implements WorkspacePort {
    readonly files = new Map<string, string>();
    readonly symbolicLinks = new Set<string>();
    readonly watchers: WorkspaceWatcher[] = [];

    private readonly folders: string[];
    // Holds every ancestor of each member, as `mkdir -p` would.
    private readonly directories = new Set<string>();

    constructor(folders: string[] = [], files: Record<string, string> = {}) {
        this.folders = [...folders];
        for (const [path, content] of Object.entries(files)) {
            const filePath = withoutFileScheme(path);
            this.addDirectory(posix.dirname(filePath));
            this.files.set(filePath, content);
        }
    }

    addFolder(path: string): void {
        if (!this.folders.includes(path)) this.folders.push(path);
    }

    removeFolder(path: string): void {
        const index = this.folders.indexOf(path);
        if (index >= 0) this.folders.splice(index, 1);
    }

    getWorkspaceFolderForDocument(document: string): string {
        const folder = this.findWorkspaceFolderForDocument(document);
        if (folder === undefined) {
            throw new NoWorkspaceFolderFoundError();
        }
        return folder;
    }

    findWorkspaceFolderForDocument(document: string): string | undefined {
        const documentPath = withoutFileScheme(document);
        return this.folders
            .filter((folder) => isWithinRoot(documentPath, withoutFileScheme(folder)))
            .sort((a, b) => b.length - a.length)[0];
    }

    getWorkspaceFolderPaths(): string[] {
        return [...this.folders];
    }

    getDocumentDirectory(document: string): string {
        return posix.dirname(document);
    }

    async readDirectory(path: string): Promise<[string, "file" | "directory"][]> {
        const directory = withoutFileScheme(path);
        const entries = new Map<string, "file" | "directory">();
        const addEntryFor = (known: string, type: "file" | "directory") => {
            const below = relativeToRoot(known, directory);
            if (!below) return;
            const [name, ...deeper] = below.split("/");
            entries.set(name, deeper.length > 0 ? "directory" : type);
        };
        this.files.forEach((_content, filePath) => addEntryFor(filePath, "file"));
        this.directories.forEach((known) => addEntryFor(known, "directory"));
        if (entries.size === 0 && !this.directories.has(directory)) {
            throw new DirectoryNotFound(path);
        }
        return [...entries];
    }

    async readFile(path: string): Promise<string> {
        const content = this.files.get(withoutFileScheme(path));
        if (content === undefined) {
            throw new FileNotFound(path);
        }
        return content;
    }

    async isSymbolicLink(path: string): Promise<boolean> {
        return this.symbolicLinks.has(withoutFileScheme(path));
    }

    async writeFile(path: string, content: string): Promise<void> {
        const filePath = withoutFileScheme(path);
        const existed = this.files.has(filePath);
        this.addDirectory(posix.dirname(filePath));
        this.files.set(filePath, content);
        this.notify(filePath, existed ? "onChange" : "onCreate");
    }

    async deleteDirectory(path: string): Promise<void> {
        const directory = withoutFileScheme(path);
        const below = (known: string) => isWithinRoot(known, directory);
        const existed = [...this.directories, ...this.files.keys()].some(below);
        [...this.directories].filter(below).forEach((known) => this.directories.delete(known));
        [...this.files.keys()].filter(below).forEach((filePath) => this.files.delete(filePath));
        if (existed) this.notify(directory, "onDelete");
    }

    /**
     * Creates a directory with `files` below it, as another program moving it
     * in would; the port cannot. A directory that is new reports one create.
     * Files for a directory that exists throw: a host reports each of them.
     */
    createDirectory(path: string, files: Readonly<Record<string, string>> = {}): void {
        const directory = withoutFileScheme(path);
        const isNew = !this.directories.has(directory);
        if (!isNew && Object.keys(files).length > 0) {
            throw new Error(`${directory} exists; write its new files one by one`);
        }
        this.addDirectory(directory);
        for (const [file, content] of Object.entries(files)) {
            const filePath = withoutFileScheme(file);
            this.addDirectory(posix.dirname(filePath));
            this.files.set(filePath, content);
        }
        if (isNew) this.notify(directory, "onCreate");
    }

    deleteFile(path: string): void {
        const filePath = withoutFileScheme(path);
        if (this.files.delete(filePath)) this.notify(filePath, "onDelete");
    }

    async findFiles(pattern: string, exclude?: string | null): Promise<string[]> {
        const include = globToRegExp(pattern);
        const excluded = exclude ? globToRegExp(exclude) : undefined;
        const found: string[] = [];
        for (const folder of this.folders) {
            const folderPath = withoutFileScheme(folder);
            for (const filePath of this.files.keys()) {
                const relative = relativeToRoot(filePath, folderPath);
                if (!relative || !include.test(relative) || excluded?.test(relative)) continue;
                found.push(filePath);
            }
        }
        return found;
    }

    createWatcher(rootPath: string, glob: string, handlers: WatcherHandlers): { dispose(): void } {
        const watcher: WorkspaceWatcher = { root: rootPath, glob, handlers, disposed: false };
        this.watchers.push(watcher);
        return {
            dispose: () => {
                watcher.disposed = true;
            },
        };
    }

    private addDirectory(directory: string): void {
        let current = directory;
        while (!this.directories.has(current)) {
            this.directories.add(current);
            current = posix.dirname(current);
        }
    }

    private notify(path: string, event: keyof WatcherHandlers): void {
        for (const { root, glob, handlers, disposed } of [...this.watchers]) {
            const below = relativeToRoot(path, withoutFileScheme(root));
            if (!disposed && below && globToRegExp(glob).test(below)) {
                handlers[event]?.(path);
            }
        }
    }
}
