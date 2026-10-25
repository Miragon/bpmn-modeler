import { posix } from "path";

import {
    DirectoryNotFound,
    FileNotFound,
    NoWorkspaceFolderFoundError,
} from "../shared/domain/errors";
import { globToRegExp } from "../shared/domain/globToRegExp";
import { WorkspacePort } from "../shared/domain/hostPorts";

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
 * Workspace folders and files held in memory. File mutations, through the port
 * or through {@link deleteFile}, notify the live watchers whose root and glob
 * match, so a test drives watcher-based behaviour by changing files.
 * `watchers` keeps every watcher ever created, disposed ones included, so a
 * test can check what was watched and fire an event no file change produces.
 */
export class InMemoryWorkspace implements WorkspacePort {
    readonly files = new Map<string, string>();
    readonly symbolicLinks = new Set<string>();
    readonly watchers: WorkspaceWatcher[] = [];

    constructor(
        private readonly folders: string[] = [],
        files: Record<string, string> = {},
    ) {
        for (const [path, content] of Object.entries(files)) {
            this.files.set(path, content);
        }
    }

    getWorkspaceFolderForDocument(document: string): string {
        const folder = this.findWorkspaceFolderForDocument(document);
        if (folder === undefined) {
            throw new NoWorkspaceFolderFoundError();
        }
        return folder;
    }

    findWorkspaceFolderForDocument(document: string): string | undefined {
        return this.folders
            .filter((folder) => folder === document || isWithin(folder, document))
            .sort((a, b) => b.length - a.length)[0];
    }

    getWorkspaceFolderPaths(): string[] {
        return [...this.folders];
    }

    getDocumentDirectory(document: string): string {
        return posix.dirname(document);
    }

    async readDirectory(path: string): Promise<[string, "file" | "directory"][]> {
        const entries = new Map<string, "file" | "directory">();
        for (const filePath of this.files.keys()) {
            if (!isWithin(path, filePath)) continue;
            const [name, ...rest] = posix.relative(path, filePath).split("/");
            entries.set(name, rest.length > 0 ? "directory" : "file");
        }
        if (entries.size === 0) {
            throw new DirectoryNotFound(path);
        }
        return [...entries];
    }

    async readFile(path: string): Promise<string> {
        const content = this.files.get(path);
        if (content === undefined) {
            throw new FileNotFound(path);
        }
        return content;
    }

    async isSymbolicLink(path: string): Promise<boolean> {
        return this.symbolicLinks.has(path);
    }

    async writeFile(path: string, content: string): Promise<void> {
        const existed = this.files.has(path);
        this.files.set(path, content);
        this.notify(path, existed ? "onChange" : "onCreate");
    }

    async deleteDirectory(path: string): Promise<void> {
        for (const filePath of [...this.files.keys()]) {
            if (isWithin(path, filePath)) this.deleteFile(filePath);
        }
    }

    deleteFile(path: string): void {
        if (this.files.delete(path)) this.notify(path, "onDelete");
    }

    async findFiles(pattern: string, exclude?: string | null, limit?: number): Promise<string[]> {
        const include = globToRegExp(pattern);
        const excluded = exclude ? globToRegExp(exclude) : undefined;
        const found: string[] = [];
        for (const folder of this.folders) {
            for (const filePath of this.files.keys()) {
                if (!isWithin(folder, filePath)) continue;
                const relative = posix.relative(folder, filePath);
                if (!include.test(relative) || excluded?.test(relative)) continue;
                found.push(filePath);
                if (limit !== undefined && found.length >= limit) return found;
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

    private notify(path: string, event: keyof WatcherHandlers): void {
        for (const { root, glob, handlers, disposed } of [...this.watchers]) {
            if (disposed || !isWithin(root, path)) continue;
            if (globToRegExp(glob).test(posix.relative(root, path))) {
                handlers[event]?.(path);
            }
        }
    }
}

function isWithin(directory: string, path: string): boolean {
    const relative = posix.relative(directory, path);
    return relative !== "" && !relative.startsWith("..") && !posix.isAbsolute(relative);
}
